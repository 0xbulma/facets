import { execFileSync } from "node:child_process";
import {
	closeSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type GoalFinding,
	type GoalLoopState,
	hashActionable,
	nextGoalAction,
	parseState,
	partition,
	UsageError,
} from "./goal-loop.ts";

function finding(severity: string, over: Partial<GoalFinding> = {}): GoalFinding {
	return { severity, file: "a.ts", line: 1, description: "WHAT: x FIX: y", ...over };
}

function state(over: Partial<GoalLoopState> = {}): GoalLoopState {
	return {
		iteration: 1,
		max_iters: 5,
		failed_agents: [],
		total_agents_launched: 12,
		prev_actionable_hash: "",
		findings: [],
		head_branch: "feat/x",
		base_branch: "main",
		...over,
	};
}

describe("partition", () => {
	it("routes critical/high/medium to actionable and low to triage", () => {
		const result = partition([
			finding("critical"),
			finding("high"),
			finding("medium"),
			finding("low"),
		]);
		expect(result.actionable.map((f) => f.severity)).toEqual(["critical", "high", "medium"]);
		expect(result.low.map((f) => f.severity)).toEqual(["low"]);
	});

	it("treats an unrecognized severity as non-actionable (never auto-fixed on a guess)", () => {
		const result = partition([finding("catastrophic")]);
		expect(result.actionable).toEqual([]);
		expect(result.low).toHaveLength(1);
	});
});

describe("hashActionable", () => {
	it("is order-independent — agent ordering must not read as progress", () => {
		const a = finding("high", { file: "a.ts", line: 1 });
		const b = finding("high", { file: "b.ts", line: 9 });
		expect(hashActionable([a, b])).toBe(hashActionable([b, a]));
	});

	it("changes when a finding's file, line or description changes", () => {
		const base = hashActionable([finding("high")]);
		expect(hashActionable([finding("high", { file: "b.ts" })])).not.toBe(base);
		expect(hashActionable([finding("high", { line: 2 })])).not.toBe(base);
		expect(hashActionable([finding("high", { description: "WHAT: z FIX: w" })])).not.toBe(base);
	});

	it("is severity-blind — the same unfixed finding re-graded is not progress", () => {
		expect(hashActionable([finding("high")])).toBe(hashActionable([finding("medium")]));
	});

	it("does not collide on adjacent field boundaries", () => {
		const a = hashActionable([finding("high", { file: "a", line: 1, description: "b" })]);
		const b = hashActionable([finding("high", { file: "a 1", line: 1, description: "b" })]);
		expect(a).not.toBe(b);
	});

	it("does not collide across record boundaries", () => {
		// Two findings vs one whose description happens to spell out the second.
		// Descriptions are free-form prose that routinely cites `path line` pairs,
		// so a plain separator would hash these identically and fire GOAL_STUCK on
		// a loop that was still making progress.
		const two = hashActionable([
			finding("high", { file: "a", line: 1, description: "b" }),
			finding("high", { file: "c", line: 2, description: "d" }),
		]);
		const one = hashActionable([finding("high", { file: "a", line: 1, description: "bc 2 d" })]);
		expect(two).not.toBe(one);
	});

	it("does not collide when a description contains the record separator", () => {
		const withNewline = hashActionable([
			finding("high", { file: "a", line: 1, description: 'x"]\n["c",2,"d' }),
		]);
		const asTwo = hashActionable([
			finding("high", { file: "a", line: 1, description: "x" }),
			finding("high", { file: "c", line: 2, description: "d" }),
		]);
		expect(withNewline).not.toBe(asTwo);
	});

	it("produces a hash with no control bytes (the file must stay git-text)", () => {
		expect(hashActionable([finding("high")])).toMatch(/^[0-9a-f]{16}$/);
	});
});

describe("nextGoalAction", () => {
	it("converges on an empty actionable set with a complete panel", () => {
		const decision = nextGoalAction(state({ iteration: 2, findings: [finding("low")] }));
		expect(decision.action).toBe("converged");
		expect(decision.low_count).toBe(1);
		expect(decision.sentinel).toContain("GOAL_CLEAN");
		expect(decision.sentinel).toContain("after 2 iteration(s) on feat/x vs main");
		expect(decision.sentinel).toContain("1 low finding(s) triaged");
	});

	it("reports incomplete — not clean — when an agent failed (feedback #45)", () => {
		const decision = nextGoalAction(state({ failed_agents: ["web3", "docs"] }));
		expect(decision.action).toBe("incomplete");
		expect(decision.sentinel).toContain("GOAL_INCOMPLETE");
		expect(decision.sentinel).toContain("2 of 12 agents failed (web3, docs)");
	});

	it("stops stuck when the actionable set repeats", () => {
		const findings = [finding("high")];
		const first = nextGoalAction(state({ findings }));
		expect(first.action).toBe("fix");
		const second = nextGoalAction(
			state({ iteration: 2, findings, prev_actionable_hash: first.actionable_hash }),
		);
		expect(second.action).toBe("stuck");
		expect(second.sentinel).toContain("GOAL_STUCK");
		expect(second.sentinel).toContain("iteration 2 and 1");
	});

	it("does not read an empty prev hash as a repeat on iteration 1", () => {
		expect(nextGoalAction(state({ findings: [finding("high")] })).action).toBe("fix");
	});

	it("stops maxed at the ceiling with work left", () => {
		const decision = nextGoalAction(
			state({ iteration: 5, findings: [finding("high"), finding("medium")] }),
		);
		expect(decision.action).toBe("maxed");
		expect(decision.sentinel).toContain("GOAL_MAXED");
		expect(decision.sentinel).toContain("2 actionable finding(s) remain after 5 iteration(s)");
	});

	it("converges at the ceiling rather than reporting maxed", () => {
		expect(nextGoalAction(state({ iteration: 5, findings: [] })).action).toBe("converged");
	});

	it("prefers stuck over maxed when both hold on the final iteration", () => {
		const findings = [finding("high")];
		const hash = hashActionable(findings);
		const decision = nextGoalAction(state({ iteration: 5, findings, prev_actionable_hash: hash }));
		expect(decision.action).toBe("stuck");
	});

	it("prefers incomplete over stuck when the panel is broken and lows repeat", () => {
		const decision = nextGoalAction(
			state({ iteration: 3, findings: [finding("low")], failed_agents: ["tests"] }),
		);
		expect(decision.action).toBe("incomplete");
	});

	it("keeps fixing below the ceiling and carries a hash forward", () => {
		const decision = nextGoalAction(state({ iteration: 4, findings: [finding("critical")] }));
		expect(decision.action).toBe("fix");
		expect(decision.sentinel).toBeNull();
		expect(decision.actionable_count).toBe(1);
		expect(decision.actionable_hash).toMatch(/^[0-9a-f]{16}$/);
	});

	it("stops maxed on a single-iteration budget instead of looping", () => {
		expect(nextGoalAction(state({ max_iters: 1, findings: [finding("high")] })).action).toBe(
			"maxed",
		);
	});
});

describe("parseState", () => {
	const valid = JSON.stringify(state({ findings: [finding("high")] }));

	it("round-trips a valid payload", () => {
		expect(parseState(valid).findings).toHaveLength(1);
	});

	it("rejects malformed JSON, non-objects and missing fields", () => {
		expect(() => parseState("{")).toThrow(UsageError);
		expect(() => parseState("[]")).toThrow(UsageError);
		expect(() => parseState("{}")).toThrow(UsageError);
	});

	it("rejects a zero or negative iteration (the contract is 1-based)", () => {
		expect(() => parseState(JSON.stringify({ ...state(), iteration: 0 }))).toThrow(UsageError);
		expect(() => parseState(JSON.stringify({ ...state(), max_iters: 0 }))).toThrow(UsageError);
	});

	it("rejects findings that are not objects with the required fields", () => {
		expect(() => parseState(JSON.stringify({ ...state(), findings: "nope" }))).toThrow(UsageError);
		expect(() => parseState(JSON.stringify({ ...state(), findings: [1] }))).toThrow(UsageError);
		expect(() =>
			parseState(JSON.stringify({ ...state(), findings: [{ severity: "high", file: "a.ts" }] })),
		).toThrow(UsageError);
		expect(() =>
			parseState(JSON.stringify({ ...state(), findings: [{ ...finding("high"), line: "1" }] })),
		).toThrow(UsageError);
	});

	it("rejects a non-string failed_agents entry", () => {
		expect(() => parseState(JSON.stringify({ ...state(), failed_agents: [7] }))).toThrow(
			UsageError,
		);
	});
});

describe("CLI", () => {
	const SCRIPT = join(import.meta.dirname, "goal-loop.ts");

	function run(payload: string, script = SCRIPT): { code: number; stdout: string } {
		try {
			return {
				code: 0,
				stdout: execFileSync("node", [script], { input: payload, encoding: "utf8" }),
			};
		} catch (error) {
			if (error instanceof Error && "status" in error && typeof error.status === "number") {
				const out = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
				return { code: error.status, stdout: out };
			}
			throw error;
		}
	}

	it("decides from stdin and prints JSON", () => {
		const result = run(JSON.stringify(state({ findings: [finding("high")] })));
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout).action).toBe("fix");
	});

	it("exits 2 on invalid input rather than emitting a decision", () => {
		const result = run("not json");
		expect(result.code).toBe(2);
		// Empty stdout on a non-zero exit is the contract: a caller that captures
		// `$(...)` without checking the status must not be able to read a decision.
		expect(result.stdout).toBe("");
	});

	it("exits 3 with empty stdout when stdin cannot be read", () => {
		// The documented internal-error path. Both hosts branch on "non-zero exit
		// => no decision produced", so it must be reachable and distinguishable.
		const fd = openSync(tmpdir(), "r");
		try {
			const result = execFileSync("node", [SCRIPT], { stdio: [fd, "pipe", "pipe"] });
			expect.unreachable(`expected a non-zero exit, got: ${result.toString()}`);
		} catch (error) {
			expect(error instanceof Error && "status" in error && error.status).toBe(3);
			const out =
				error instanceof Error && "stdout" in error && typeof error.stdout === "string"
					? error.stdout
					: "";
			expect(out).toBe("");
		} finally {
			closeSync(fd);
		}
	});

	it("runs from a path containing a space (the #42 isMain regression)", () => {
		// goal-loop.ts imports only node builtins, so a single-file copy runs standalone.
		const base = realpathSync(mkdtempSync(join(tmpdir(), "gl-space-")));
		const spacedDir = join(base, "has space");
		try {
			mkdirSync(spacedDir);
			const spacedScript = join(spacedDir, "goal-loop.ts");
			copyFileSync(SCRIPT, spacedScript);
			const result = run(JSON.stringify(state()), spacedScript);
			expect(JSON.parse(result.stdout).action).toBe("converged");
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});
