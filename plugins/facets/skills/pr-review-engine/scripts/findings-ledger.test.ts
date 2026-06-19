import { describe, expect, it } from "vitest";
import {
	findingId,
	ledgerPath,
	loadLedger,
	mergeLedger,
	normalize,
	parseArgs,
	parseLedger,
	saveLedger,
	UsageError,
	whatClause,
} from "./findings-ledger.ts";

type Finding = {
	severity: "critical" | "high" | "medium" | "low";
	file: string;
	line: number;
	description: string;
	lens?: string;
};

function finding(over: Partial<Finding> = {}): Finding {
	return {
		severity: "high",
		file: "src/X.ts",
		line: 10,
		description: "WHAT: leak. FIX: clean up.",
		...over,
	};
}

const EMPTY = { findings: [] };

describe("whatClause", () => {
	it("extracts the WHAT clause up to FIX", () => {
		expect(whatClause("WHAT: the bug. FIX: the change.")).toBe("the bug. ");
	});
	it("falls back to the whole description when no WHAT clause", () => {
		expect(whatClause("just some text")).toBe("just some text");
	});
});

describe("normalize", () => {
	it("lowercases and collapses non-alphanumerics", () => {
		expect(normalize("  Foo--Bar_123!!  ")).toBe("foo bar 123");
	});
});

describe("findingId", () => {
	it("is stable across line drift and FIX-clause rephrasing", () => {
		const a = findingId({ file: "src/X.ts", description: "WHAT: leak here. FIX: do A." });
		const b = findingId({ file: "src/X.ts", description: "WHAT: leak  here.  FIX: do B instead." });
		expect(a).toBe(b);
	});
	it("differs when the file differs", () => {
		const a = findingId({ file: "src/X.ts", description: "WHAT: leak. FIX: x." });
		const b = findingId({ file: "src/Y.ts", description: "WHAT: leak. FIX: x." });
		expect(a).not.toBe(b);
	});
	it("differs when the WHAT clause differs", () => {
		const a = findingId({ file: "src/X.ts", description: "WHAT: leak. FIX: x." });
		const b = findingId({ file: "src/X.ts", description: "WHAT: race. FIX: x." });
		expect(a).not.toBe(b);
	});
	it("separates lens so the same WHAT under different lenses is distinct", () => {
		const a = findingId({ file: "src/X.ts", lens: "perf", description: "WHAT: leak. FIX: x." });
		const b = findingId({
			file: "src/X.ts",
			lens: "correctness",
			description: "WHAT: leak. FIX: x.",
		});
		expect(a).not.toBe(b);
	});
});

describe("parseLedger", () => {
	it("returns an empty ledger on unparseable JSON", () => {
		expect(parseLedger("not json")).toEqual(EMPTY);
	});
	it("returns an empty ledger when findings is missing", () => {
		expect(parseLedger('{"x":1}')).toEqual(EMPTY);
	});
	it("drops malformed entries and keeps valid ones", () => {
		const text = JSON.stringify({
			findings: [
				{
					id: "abc",
					file: "src/X.ts",
					line: 1,
					severity: "high",
					lens: "",
					description: "WHAT: a. FIX: b.",
					status: "open",
					first_seen_sha: "s1",
					last_seen_sha: "s1",
					posted_comment_id: null,
				},
				{ id: "bad", severity: "nope" },
			],
		});
		const ledger = parseLedger(text);
		expect(ledger.findings).toHaveLength(1);
		expect(ledger.findings[0]?.id).toBe("abc");
	});
});

describe("mergeLedger", () => {
	it("classifies a first-seen finding as net_new with first/last seen = headSha", () => {
		const out = mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1" });
		expect(out.net_new).toHaveLength(1);
		expect(out.recurring).toEqual([]);
		expect(out.net_new[0]?.first_seen_sha).toBe("sha1");
		expect(out.net_new[0]?.status).toBe("open");
		expect(out.ledger.findings).toHaveLength(1);
	});

	it("classifies a previously-seen finding as recurring and refreshes last_seen + line", () => {
		const first = mergeLedger({
			ledger: EMPTY,
			findings: [finding({ line: 10 })],
			headSha: "sha1",
		});
		const second = mergeLedger({
			ledger: first.ledger,
			findings: [finding({ line: 22 })],
			headSha: "sha2",
		});
		expect(second.net_new).toEqual([]);
		expect(second.recurring).toHaveLength(1);
		expect(second.recurring[0]?.first_seen_sha).toBe("sha1");
		expect(second.recurring[0]?.last_seen_sha).toBe("sha2");
		expect(second.recurring[0]?.line).toBe(22);
	});

	it("marks an open finding resolved when it disappears", () => {
		const first = mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1" });
		const second = mergeLedger({ ledger: first.ledger, findings: [], headSha: "sha2" });
		expect(second.resolved).toHaveLength(1);
		expect(second.resolved[0]?.status).toBe("resolved");
		expect(second.ledger.findings[0]?.status).toBe("resolved");
	});

	it("suppresses (does not surface, does not auto-resolve) a wontfix finding", () => {
		const base = mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1" }).ledger
			.findings[0];
		if (base === undefined) throw new Error("seed setup failed");
		const seeded = { findings: [{ ...base, status: "wontfix" as const }] };
		// reappears -> suppressed, not recurring
		const present = mergeLedger({ ledger: seeded, findings: [finding()], headSha: "sha2" });
		expect(present.recurring).toEqual([]);
		expect(present.suppressed).toHaveLength(1);
		// absent -> still wontfix, NOT auto-resolved
		const absent = mergeLedger({ ledger: seeded, findings: [], headSha: "sha2" });
		expect(absent.resolved).toEqual([]);
		expect(absent.ledger.findings[0]?.status).toBe("wontfix");
	});

	it("re-opens a resolved finding that reappears (counted recurring)", () => {
		const first = mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1" });
		const gone = mergeLedger({ ledger: first.ledger, findings: [], headSha: "sha2" });
		const back = mergeLedger({ ledger: gone.ledger, findings: [finding()], headSha: "sha3" });
		expect(back.net_new).toEqual([]);
		expect(back.recurring).toHaveLength(1);
		expect(back.recurring[0]?.status).toBe("open");
	});

	it("de-dupes identical findings within a single run", () => {
		const out = mergeLedger({ ledger: EMPTY, findings: [finding(), finding()], headSha: "sha1" });
		expect(out.net_new).toHaveLength(1);
		expect(out.ledger.findings).toHaveLength(1);
	});

	it("does not mutate the input ledger", () => {
		const first = mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1" });
		const snapshot = structuredClone(first.ledger);
		mergeLedger({ ledger: first.ledger, findings: [], headSha: "sha2" });
		expect(first.ledger).toEqual(snapshot);
	});
});

describe("ledgerPath", () => {
	it("joins dir/owner-repo-key.json and sanitizes the key", () => {
		expect(ledgerPath({ dir: "/tmp/led", owner: "o", repo: "r", key: "feat/x y" })).toBe(
			"/tmp/led/o-r-feat-x-y.json",
		);
	});
});

describe("loadLedger / saveLedger (injected IO)", () => {
	it("loadLedger returns an empty ledger when the reader yields null", () => {
		expect(loadLedger("/nope.json", () => null)).toEqual(EMPTY);
	});
	it("saveLedger writes pretty JSON with a trailing newline", () => {
		let written = "";
		saveLedger({
			path: "/x.json",
			ledger: { findings: [] },
			writeFile: (_p, text) => {
				written = text;
			},
		});
		expect(written).toBe(`${JSON.stringify({ findings: [] }, null, 2)}\n`);
	});
});

describe("parseArgs", () => {
	it("parses the required flags and --write", () => {
		const args = parseArgs(["--ledger", "/l.json", "--head-sha", "abc", "--write"]);
		expect(args).toEqual({ ledger: "/l.json", findings: undefined, headSha: "abc", write: true });
	});
	it("throws UsageError when --ledger is missing", () => {
		expect(() => parseArgs(["--head-sha", "abc"])).toThrow(UsageError);
	});
	it("throws UsageError when --head-sha is missing", () => {
		expect(() => parseArgs(["--ledger", "/l.json"])).toThrow(UsageError);
	});
	it("throws UsageError on an unknown flag", () => {
		expect(() => parseArgs(["--ledger", "/l.json", "--head-sha", "a", "--bogus"])).toThrow(
			UsageError,
		);
	});
});
