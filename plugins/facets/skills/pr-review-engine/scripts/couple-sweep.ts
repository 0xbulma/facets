#!/usr/bin/env node
/**
 * couple-sweep.ts — deterministic cross-file consistency sweep (feedback #64).
 * Run with Node's native TypeScript support (Node >= 22.18):
 *
 *   node couple-sweep.ts --base <merge-base> --changed-lines <changed-lines.json> \
 *     [--changed-files <name-only.txt>]
 *
 * The problem: on doc-heavy diffs the `--goal` loop converges one nit per round,
 * because the LLM lenses rediscover mirror drift instance by instance (findings
 * 3 -> 2 -> 1 across three rounds, each a *different* paired-file lag). A single
 * exhaustive sweep finds every instance at once and collapses that tail.
 *
 * The check: which files does each changed file historically change *with*, and
 * is any such partner missing from this diff? Coupling is derived from `git log`
 * — no declared pair list, no config, works in any git repo. On this repo it
 * recovers exactly the mirror-discipline pairs (a script and its `.test.ts`, a
 * SKILL.md and `plugin.json`, CLAUDE.md and README.md) with zero setup.
 *
 * Scope, deliberately: it flags a strongly-coupled partner that is ABSENT from
 * the diff. It does not diff the contents of two changed partners — sibling
 * routes co-change heavily yet legitimately diverge, so a content check there is
 * a false-positive generator. Widen only with a per-pair semantic signal.
 *
 * History is read from `--base` (the merge base), not HEAD, so the branch's own
 * commits cannot dilute the coupling it is being measured against.
 *
 * Pass `--changed-files` (the caller's `git diff --name-only` list) whenever it
 * is available: the changed-lines map is keyed only by files git could diff, so
 * a binary file — or an uncommitted one before the overlay is merged — is absent
 * from it and would otherwise be reported as a partner the author never touched.
 *
 * Output (stdout): a JSON array of engine-shaped findings, `[]` when the sweep
 * ran and nothing fired (too little history, a shallow clone, no coupled partner
 * missing). Any cap that drops findings is reported on stderr — never silently.
 *
 * Exit codes: 0 the sweep ran, findings (possibly `[]`) are on stdout; 2 CLI
 * misuse or an unreadable input file; 3 git could not be queried. Stdout is
 * EMPTY on any non-zero exit — a failed sweep is never a clean sweep, so the
 * caller must check the status rather than defaulting the capture to `[]`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type CoupleFinding = {
	severity: "medium";
	file: string;
	line: number;
	description: string;
	confidence: number;
};

export type SweepOptions = {
	/** Minimum co-change count before a pair is evidence rather than coincidence. */
	minSupport: number;
	/** Minimum share of the source file's commits that also touched the partner. */
	minConfidence: number;
	/** Cap on emitted findings, so one sprawling diff can't flood the panel. */
	maxFindings: number;
	/** Commits touching more than this are mass edits (renames, reformats) that couple everything to everything. */
	maxCommitFiles: number;
};

export const DEFAULT_OPTIONS: SweepOptions = {
	minSupport: 3,
	minConfidence: 0.75,
	maxFindings: 20,
	maxCommitFiles: 50,
};

/** How many commits before the merge base to learn coupling from. */
const HISTORY_DEPTH = 300;

/** A heuristic is never "fully proven" — cap its self-reported confidence below that band. */
const MAX_CONFIDENCE = 85;

export type SweepInput = {
	/** One entry per commit: the file paths it touched. */
	commits: readonly (readonly string[])[];
	/**
	 * The authoritative set of files this review covers. MUST be the caller's full
	 * changed-file list, not the changed-lines keys: a file git treats as binary,
	 * or (before the overlay is merged) an uncommitted-only file, has no map key,
	 * and would then be reported as an absent partner the author already updated.
	 * Defaults to the changedLines keys when omitted.
	 */
	changedFiles?: readonly string[];
	/** The engine's CHANGED_LINES map — used to anchor each finding on a real diff line. */
	changedLines: Readonly<Record<string, readonly number[]>>;
	/** Injected existence check, so a partner deleted since is not reported as drift. */
	exists: (path: string) => boolean;
};

export type Coupling = {
	/** commits touching each file */
	totals: ReadonlyMap<string, number>;
	/** co[a][b] = commits touching both */
	pairs: ReadonlyMap<string, ReadonlyMap<string, number>>;
};

/**
 * Build the co-change matrix. Single-file commits still count toward a file's
 * total — they are evidence it changes *alone*, which is exactly what should pull
 * its coupling confidence down.
 */
export function buildCoupling(
	commits: readonly (readonly string[])[],
	options: SweepOptions = DEFAULT_OPTIONS,
): Coupling {
	const totals = new Map<string, number>();
	const pairs = new Map<string, Map<string, number>>();

	for (const commit of commits) {
		const files = [...new Set(commit)];
		if (files.length === 0 || files.length > options.maxCommitFiles) continue;
		for (const file of files) totals.set(file, (totals.get(file) ?? 0) + 1);
		for (const a of files) {
			let row = pairs.get(a);
			if (row === undefined) {
				row = new Map<string, number>();
				pairs.set(a, row);
			}
			for (const b of files) {
				if (a !== b) row.set(b, (row.get(b) ?? 0) + 1);
			}
		}
	}

	return { totals, pairs };
}

type Pairing = { source: string; partner: string; co: number; total: number };

function describe(pairing: Pairing): string {
	const { source, partner, co, total } = pairing;
	const percent = Math.round((co / total) * 100);
	return (
		`WHAT: coupled partner \`${partner}\` is absent from this diff — ` +
		`\`${source}\` co-changed with it in ${co} of its last ${total} commits (${percent}%), ` +
		"so the pair has likely drifted. " +
		`FIX: apply the matching update to \`${partner}\`, or state why the pairing no longer holds.`
	);
}

/**
 * Report every changed file whose strongly-coupled partner is missing from the
 * diff. Exhaustive by construction — one pass surfaces all of them, which is the
 * whole point versus an LLM lens finding one per review round.
 */
export function sweep(
	input: SweepInput,
	options: SweepOptions = DEFAULT_OPTIONS,
): { findings: CoupleFinding[]; truncated: number } {
	const { totals, pairs } = buildCoupling(input.commits, options);
	// Two distinct roles. `inDiff` decides whether a PARTNER counts as already
	// updated — it must be the caller's full changed-file list, including files
	// git could not diff. `sources` decides which files may CARRY a finding, and
	// is restricted to the changed-lines map: a file with no map key has no line
	// to anchor on, and the engine's scope filter drops such a finding as
	// out-of-scope, so emitting one would be a silent no-op.
	const inDiff = new Set(input.changedFiles ?? Object.keys(input.changedLines));
	const sources = Object.keys(input.changedLines)
		.filter((file) => inDiff.has(file))
		.sort();
	const scored: { finding: CoupleFinding; confidence: number; support: number }[] = [];

	for (const source of sources) {
		const total = totals.get(source) ?? 0;
		const row = pairs.get(source);
		if (total === 0 || row === undefined) continue;

		let emitted = 0;
		for (const [partner, co] of [...row].sort((a, b) => a[0].localeCompare(b[0]))) {
			if (inDiff.has(partner) || co < options.minSupport) continue;
			const confidence = co / total;
			if (confidence < options.minConfidence || !input.exists(partner)) continue;

			// Anchor on a line the diff actually touched, so the engine's scope
			// filter keeps the finding. A pure rename has no changed line; the
			// filter short-circuits that case, so line 1 is safe there.
			//
			// Walk a different changed line per emitted partner: Step 6 merges
			// same-file findings within +/-3 lines whose descriptions overlap, and
			// every finding here shares one template. Without spreading, a file
			// with three drifted partners collapses to ONE finding and the next
			// partner only appears after the first is fixed — reinstating exactly
			// the one-instance-per-round tail this sweep exists to remove.
			const lines = input.changedLines[source] ?? [];
			const anchor = lines[Math.min(emitted, lines.length - 1)] ?? 1;
			emitted += 1;
			scored.push({
				confidence,
				support: co,
				finding: {
					severity: "medium",
					file: source,
					line: anchor,
					description: describe({ source, partner, co, total }),
					confidence: Math.min(MAX_CONFIDENCE, Math.round(confidence * 100)),
				},
			});
		}
	}

	scored.sort(
		(a, b) =>
			b.confidence - a.confidence ||
			b.support - a.support ||
			a.finding.file.localeCompare(b.finding.file) ||
			a.finding.description.localeCompare(b.finding.description),
	);

	return {
		findings: scored.slice(0, options.maxFindings).map((entry) => entry.finding),
		truncated: Math.max(0, scored.length - options.maxFindings),
	};
}

/** Parse `git log --pretty=format:@%H --name-only` into one file list per commit. */
export function parseLog(raw: string): string[][] {
	const commits: string[][] = [];
	let current: string[] | undefined;
	for (const line of raw.split("\n")) {
		if (/^@[0-9a-f]{7,40}$/.test(line)) {
			current = [];
			commits.push(current);
			continue;
		}
		if (line !== "" && current !== undefined) current.push(line);
	}
	return commits;
}

/** Read the engine's CHANGED_LINES map, keeping only well-formed integer arrays. */
export function parseChangedLines(raw: string): Record<string, number[]> {
	const parsed: unknown = JSON.parse(raw);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new UsageError("--changed-lines must contain a JSON object");
	}
	const map: Record<string, number[]> = {};
	for (const [file, lines] of Object.entries(parsed)) {
		if (!Array.isArray(lines)) continue;
		map[file] = lines.filter((line) => typeof line === "number" && Number.isInteger(line));
	}
	return map;
}

export class UsageError extends Error {}

export type CliArgs = { base: string; changedLines: string; changedFiles?: string };

export function parseArgs(argv: readonly string[]): CliArgs {
	let base: string | undefined;
	let changedLines: string | undefined;
	let changedFiles: string | undefined;
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--base") {
			base = argv[i + 1];
			i += 1;
		} else if (argv[i] === "--changed-lines") {
			changedLines = argv[i + 1];
			i += 1;
		} else if (argv[i] === "--changed-files") {
			changedFiles = argv[i + 1];
			i += 1;
		}
	}
	if (base === undefined || changedLines === undefined) {
		throw new UsageError(
			"usage: couple-sweep.ts --base <merge-base> --changed-lines <path> [--changed-files <path>]",
		);
	}
	return changedFiles === undefined ? { base, changedLines } : { base, changedLines, changedFiles };
}

/** One path per line; blank lines dropped. The caller's `git diff --name-only` output. */
export function parseChangedFiles(raw: string): string[] {
	return raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

function main(): number {
	let args: CliArgs;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		if (error instanceof UsageError) {
			process.stderr.write(`couple-sweep: ${error.message}\n`);
			return 2;
		}
		throw error;
	}

	let changedLines: Record<string, number[]>;
	try {
		changedLines = parseChangedLines(readFileSync(args.changedLines, "utf8"));
	} catch (error) {
		process.stderr.write(
			`couple-sweep: cannot read --changed-lines: ${error instanceof Error ? error.message : error}\n`,
		);
		return 2;
	}

	let changedFiles: string[] | undefined;
	if (args.changedFiles !== undefined) {
		try {
			changedFiles = parseChangedFiles(readFileSync(args.changedFiles, "utf8"));
			if (changedFiles.length === 0) {
				// The caller only passes this flag when it has a list, and the engine
				// bails out earlier on an empty diff. An empty file therefore means the
				// caller's list-building failed — and an empty changed set would make
				// the sweep emit `[]` at exit 0, indistinguishable from "no drift".
				process.stderr.write(
					"couple-sweep: --changed-files is empty; the review scope could not be determined\n",
				);
				return 2;
			}
		} catch (error) {
			process.stderr.write(
				`couple-sweep: cannot read --changed-files: ${error instanceof Error ? error.message : error}\n`,
			);
			return 2;
		}
	}

	// History from the merge base, so the branch's own commits can't dilute the
	// coupling. A shallow clone or a young repo just yields fewer commits -> [].
	let log: string;
	try {
		log = execFileSync(
			"git",
			["log", `--pretty=format:@%H`, "--name-only", "-n", String(HISTORY_DEPTH), args.base],
			{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
		);
	} catch (error) {
		// A failed sweep is NOT a clean sweep. Exiting 0 with `[]` would be
		// byte-identical to "checked, no drift", so the caller would report a
		// review as clean with this lens silently skipped. Exit 3 with empty
		// stdout instead, and surface git's own message.
		process.stderr.write(
			`couple-sweep: git log failed: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 3;
	}

	const result = sweep({ commits: parseLog(log), changedFiles, changedLines, exists: existsSync });
	if (result.truncated > 0) {
		process.stderr.write(
			`couple-sweep: reporting the ${DEFAULT_OPTIONS.maxFindings} strongest coupled-partner ` +
				`gaps; ${result.truncated} weaker one(s) not shown.\n`,
		);
	}
	process.stdout.write(`${JSON.stringify(result.findings, null, 2)}\n`);
	return 0;
}

// Run only when executed directly (`node couple-sweep.ts …`), not when this
// module is imported by a test for its exported helpers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exit(main());
}
