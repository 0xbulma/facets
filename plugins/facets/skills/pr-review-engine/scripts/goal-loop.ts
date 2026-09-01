#!/usr/bin/env node
/**
 * goal-loop.ts — the `--goal` loop's post-iteration decision (feedback #63).
 * Run with Node's native TypeScript support (Node >= 22.18):
 *
 *   echo '<state json>' | node goal-loop.ts
 *
 * Every other piece of deterministic review logic (the changed-lines map, the
 * scope filter, the ledger, the git-scope helpers) ships as a unit-tested script;
 * the goal loop's stop conditions were the one exception — success check, stuck
 * check, iteration ceiling, and sentinel selection lived only in SKILL.md prose
 * and were re-derived by the model every run, so a regression in them could not
 * fail a gate. This is that logic, as one pure function under `pnpm verify`.
 *
 * Input (stdin): JSON object
 *   {
 *     "iteration": 2,                       // 1-based, the iteration just reviewed
 *     "max_iters": 5,
 *     "failed_agents": ["web3"],            // names, from the engine's FAILED_AGENTS
 *     "total_agents_launched": 12,
 *     "prev_actionable_hash": "a1b2…",      // "" on iteration 1
 *     "findings": [ {severity, file, line, description}, … ],   // ALL findings, lows included
 *     "head_branch": "feat/x",
 *     "base_branch": "main"
 *   }
 *
 * Output (stdout): JSON object
 *   { "action": "fix"|"converged"|"stuck"|"maxed"|"incomplete",
 *     "actionable_hash": "…", "actionable_count": N, "low_count": K,
 *     "sentinel": "Sentinel: GOAL_… — …" | null }
 *
 * `sentinel` is null for BOTH `fix` and `converged`: `fix` has nothing to report,
 * and `converged` must not mint GOAL_CLEAN at loop-break — that token certifies
 * the runtime pass, ledger stamp and push, which happen afterwards, so the Final
 * summary owns it. The three failure actions each carry their own sentinel.
 *
 * The caller carries `actionable_hash` forward as the next call's
 * `prev_actionable_hash`, and branches on `action`: `fix` continues the loop;
 * `converged` breaks it successfully and proceeds to the post-convergence steps;
 * `stuck`, `maxed` and `incomplete` stop it after printing `sentinel`.
 *
 * Exit codes: 0 a decision was produced on stdout; 2 CLI misuse / invalid input;
 * 3 internal error. Stdout is EMPTY on any non-zero exit, so a caller must check
 * the status: an empty capture is "no decision", never a converged one.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Severities the loop auto-fixes. `low` is never auto-fixed — it is carried to the summary for the user to triage. */
const ACTIONABLE_SEVERITIES = new Set(["critical", "high", "medium"]);

/** The only non-actionable label that still counts as a proven-clean outcome. */
const TRIAGE_SEVERITY = "low";

export type GoalAction = "fix" | "converged" | "stuck" | "maxed" | "incomplete";

/** A finding as produced by the engine's `FINDINGS` (extra keys are ignored). */
export type GoalFinding = {
	severity: string;
	file: string;
	line: number;
	description: string;
};

export type GoalLoopState = {
	iteration: number;
	max_iters: number;
	failed_agents: string[];
	total_agents_launched: number;
	prev_actionable_hash: string;
	findings: GoalFinding[];
	head_branch: string;
	base_branch: string;
};

export type GoalLoopDecision = {
	action: GoalAction;
	actionable_hash: string;
	actionable_count: number;
	low_count: number;
	sentinel: string | null;
};

export class UsageError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The stuck-check identity: a hash over the actionable set, sorted by
 * (file, line, description) so agent ordering can't perturb it. Deliberately
 * excludes severity — a finding re-reported at a different severity is the same
 * unfixed finding, and treating it as progress would defeat the stuck check.
 *
 * Each finding is JSON-encoded before joining so the serialization is
 * unambiguous across record boundaries: descriptions are free-form LLM prose
 * that routinely cites `path line` pairs, and a plain separator would let two
 * findings hash the same as one whose description happens to contain the
 * separator plus a path — collapsing distinct sets and firing GOAL_STUCK on a
 * loop that was still making progress.
 */
export function hashActionable(findings: readonly GoalFinding[]): string {
	const key = findings
		.map((f) => JSON.stringify([f.file, f.line, f.description]))
		.sort()
		.join("\n");
	return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Split `FINDINGS` into the auto-fixable set, the carried-forward `low` triage
 * list, and anything whose severity is not a recognized label.
 *
 * `unknown` exists because two intents were being conflated. Not auto-fixing a
 * finding whose severity you cannot parse is right — you would be guessing at a
 * blast radius. Concluding it is therefore harmless is not: the synthetic
 * findings a red re-gate produces are authored by the model and never pass
 * `validate-findings.ts`, which is the only thing that rejects unknown labels.
 * So the single input that carries "the tree is red" is exactly the input a typo
 * can turn into a non-blocking `low`. Unknown is never fixed AND never clean.
 */
export function partition(findings: readonly GoalFinding[]): {
	actionable: GoalFinding[];
	low: GoalFinding[];
	unknown: GoalFinding[];
} {
	const actionable: GoalFinding[] = [];
	const low: GoalFinding[] = [];
	const unknown: GoalFinding[] = [];
	for (const finding of findings) {
		if (ACTIONABLE_SEVERITIES.has(finding.severity)) actionable.push(finding);
		else if (finding.severity === TRIAGE_SEVERITY) low.push(finding);
		else unknown.push(finding);
	}
	return { actionable, low, unknown };
}

/**
 * The loop's whole stop-condition state machine, as one pure function.
 *
 * Check order matters and mirrors the documented contract:
 *   1. no actionable findings AND no failed agent  -> converged
 *   2. no actionable findings BUT an agent failed  -> incomplete (an empty set is
 *      unproven when a lens crashed; a false clean is unrecoverable)
 *   3. the same actionable set two iterations running -> stuck
 *   4. the iteration ceiling is reached with work left -> maxed (stop BEFORE
 *      fixing: an unreviewed fix round would leave committed work no lens ever
 *      saw, and would make the reported residual stale relative to the tree)
 *   5. otherwise -> fix
 */
export function nextGoalAction(state: GoalLoopState): GoalLoopDecision {
	const { actionable, low, unknown } = partition(state.findings);
	const hash = hashActionable(actionable);
	const base = {
		actionable_hash: hash,
		actionable_count: actionable.length,
		low_count: low.length,
	};

	// Before any success check: an unparseable severity means the set cannot be
	// proven clean. Do not auto-fix it (the blast radius is a guess) and do not
	// converge past it — stop and let the user resolve it.
	if (unknown.length > 0) {
		const labels = [...new Set(unknown.map((f) => f.severity))].sort().join(", ");
		return {
			...base,
			action: "incomplete",
			sentinel:
				`Sentinel: GOAL_INCOMPLETE — ${unknown.length} finding(s) carry an unrecognized severity ` +
				`(${labels}); the set cannot be proven clean — correct the severities and re-run --goal.`,
		};
	}

	if (actionable.length === 0 && state.failed_agents.length === 0) {
		// Deliberately no sentinel. GOAL_CLEAN certifies work that has NOT happened
		// at loop-break — the runtime pass, the ledger stamp and the push all come
		// after — and it is the completion token a wrapping `/goal` audit matches on.
		// Returning it here would let any caller that prints the decision emit it
		// early, so the loop cannot mint it even by accident; the Final summary owns
		// GOAL_CLEAN. Every stopping action below DOES carry its sentinel.
		return { ...base, action: "converged", sentinel: null };
	}

	if (actionable.length === 0) {
		return {
			...base,
			action: "incomplete",
			sentinel:
				`Sentinel: GOAL_INCOMPLETE — ${state.failed_agents.length} of ${state.total_agents_launched} ` +
				`agents failed (${state.failed_agents.join(", ")}); no actionable findings does NOT mean clean — ` +
				"re-run --goal once the panel completes.",
		};
	}

	if (state.prev_actionable_hash !== "" && hash === state.prev_actionable_hash) {
		return {
			...base,
			action: "stuck",
			sentinel:
				`Sentinel: GOAL_STUCK — identical findings on iteration ${state.iteration} and ` +
				`${state.iteration - 1}; stopping for user input.`,
		};
	}

	if (state.iteration >= state.max_iters) {
		return {
			...base,
			action: "maxed",
			sentinel:
				`Sentinel: GOAL_MAXED — ${actionable.length} actionable finding(s) remain after ` +
				`${state.max_iters} iteration(s); extend, accept, or stop?`,
		};
	}

	return { ...base, action: "fix", sentinel: null };
}

function requireString(source: Record<string, unknown>, key: string): string {
	const value = source[key];
	if (typeof value !== "string") throw new UsageError(`"${key}" must be a string`);
	return value;
}

function requireCount(source: Record<string, unknown>, key: string): number {
	const value = source[key];
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new UsageError(`"${key}" must be a non-negative integer`);
	}
	return value;
}

function parseFindings(value: unknown): GoalFinding[] {
	if (!Array.isArray(value)) throw new UsageError('"findings" must be an array');
	return value.map((entry, index) => {
		if (!isRecord(entry)) throw new UsageError(`findings[${index}] must be an object`);
		const { severity, file, description, line } = entry;
		if (
			typeof severity !== "string" ||
			typeof file !== "string" ||
			typeof description !== "string"
		) {
			throw new UsageError(`findings[${index}] needs string severity, file and description`);
		}
		if (typeof line !== "number" || !Number.isInteger(line)) {
			throw new UsageError(`findings[${index}] needs an integer line`);
		}
		return { severity, file, line, description };
	});
}

function parseNames(value: unknown): string[] {
	if (!Array.isArray(value)) throw new UsageError('"failed_agents" must be an array of names');
	return value.map((name, index) => {
		if (typeof name !== "string") throw new UsageError(`failed_agents[${index}] must be a string`);
		return name;
	});
}

/** Parse the stdin payload into a validated state — no assertions, every field checked. */
export function parseState(raw: string): GoalLoopState {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new UsageError(
			`state is not valid JSON: ${error instanceof Error ? error.message : error}`,
		);
	}
	if (!isRecord(parsed)) throw new UsageError("state must be a JSON object");

	const iteration = requireCount(parsed, "iteration");
	const maxIters = requireCount(parsed, "max_iters");
	if (iteration < 1) throw new UsageError('"iteration" is 1-based and must be >= 1');
	if (maxIters < 1) throw new UsageError('"max_iters" must be >= 1');

	return {
		iteration,
		max_iters: maxIters,
		failed_agents: parseNames(parsed.failed_agents),
		total_agents_launched: requireCount(parsed, "total_agents_launched"),
		prev_actionable_hash: requireString(parsed, "prev_actionable_hash"),
		findings: parseFindings(parsed.findings),
		head_branch: requireString(parsed, "head_branch"),
		base_branch: requireString(parsed, "base_branch"),
	};
}

function main(): number {
	try {
		const decision = nextGoalAction(parseState(readFileSync(0, "utf8")));
		process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
		return 0;
	} catch (error) {
		if (error instanceof UsageError) {
			process.stderr.write(`goal-loop: ${error.message}\n`);
			return 2;
		}
		// Never let an unexpected failure escape as an unlabelled exit 1 with empty
		// stdout — the caller cannot tell that from a decision, and this call gates
		// convergence. Exit 3 says "no decision produced" in a way it can branch on.
		process.stderr.write(
			`goal-loop: internal error: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 3;
	}
}

// Run only when executed directly (`node goal-loop.ts`), not when this module is
// imported by a test for its exported helpers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exit(main());
}
