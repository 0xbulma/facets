import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	asFindingArray,
	buildCacheResult,
	findingId,
	isCacheHit,
	isCorruptLedgerText,
	loadLedger,
	mergeLedger,
	normalize,
	openFindings,
	parseArgs,
	parseLedger,
	saveLedger,
	severityCounts,
	UsageError,
	whatClause,
} from "./findings-ledger.ts";

type Finding = {
	severity: "critical" | "high" | "medium" | "low";
	file: string;
	line: number;
	description: string;
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
});

describe("parseLedger", () => {
	it("returns an empty ledger on unparseable JSON", () => {
		expect(parseLedger("not json")).toEqual(EMPTY);
	});
	it("returns an empty ledger when findings is missing", () => {
		expect(parseLedger('{"x":1}')).toEqual(EMPTY);
	});
	it("drops malformed entries, keeps valid ones, and coerces posted_comment_id", () => {
		const valid = (over: Record<string, unknown>) => ({
			id: "abc",
			file: "src/X.ts",
			line: 1,
			severity: "high",
			description: "WHAT: a. FIX: b.",
			status: "open",
			first_seen_sha: "s1",
			last_seen_sha: "s1",
			...over,
		});
		const text = JSON.stringify({
			findings: [
				valid({ id: "num", posted_comment_id: 4242 }), // numeric id preserved
				valid({ id: "str", posted_comment_id: "nope" }), // non-number coerced to null
				valid({ id: "missing" }), // absent coerced to null
				{ id: "bad", severity: "nope" }, // dropped (invalid)
			],
		});
		const ledger = parseLedger(text);
		expect(ledger.findings.map((f) => f.id)).toEqual(["num", "str", "missing"]);
		expect(ledger.findings[0]?.posted_comment_id).toBe(4242);
		expect(ledger.findings[1]?.posted_comment_id).toBeNull();
		expect(ledger.findings[2]?.posted_comment_id).toBeNull();
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

	it("re-opens a resolved finding that reappears (counted recurring, first_seen preserved)", () => {
		const first = mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1" });
		const gone = mergeLedger({ ledger: first.ledger, findings: [], headSha: "sha2" });
		const back = mergeLedger({ ledger: gone.ledger, findings: [finding()], headSha: "sha3" });
		expect(back.net_new).toEqual([]);
		expect(back.recurring).toHaveLength(1);
		expect(back.recurring[0]?.status).toBe("open");
		expect(back.recurring[0]?.first_seen_sha).toBe("sha1");
		expect(back.recurring[0]?.last_seen_sha).toBe("sha3");
	});

	it("preserves posted_comment_id across a recurring merge and a resolve", () => {
		const base = mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1" }).ledger
			.findings[0];
		if (base === undefined) throw new Error("seed setup failed");
		const seeded = { findings: [{ ...base, posted_comment_id: 4242 }] };
		const recur = mergeLedger({ ledger: seeded, findings: [finding()], headSha: "sha2" });
		expect(recur.recurring[0]?.posted_comment_id).toBe(4242);
		const resolved = mergeLedger({ ledger: seeded, findings: [], headSha: "sha2" });
		expect(resolved.resolved[0]?.posted_comment_id).toBe(4242);
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

describe("asFindingArray", () => {
	it("keeps well-formed findings and drops malformed / non-array input", () => {
		expect(asFindingArray("not an array")).toEqual([]);
		const out = asFindingArray([
			{ severity: "high", file: "a.ts", line: 1, description: "WHAT: x. FIX: y." },
			{ severity: "nope", file: "b.ts", line: 2, description: "bad sev" }, // dropped
			{ file: "c.ts", line: 3 }, // missing severity/description, dropped
		]);
		expect(out).toHaveLength(1);
		expect(out[0]?.file).toBe("a.ts");
	});
});

describe("isCorruptLedgerText", () => {
	it("is false for empty/whitespace and a valid ledger, true for garbage/wrong-shape", () => {
		expect(isCorruptLedgerText("")).toBe(false);
		expect(isCorruptLedgerText("   \n")).toBe(false);
		expect(isCorruptLedgerText('{"findings":[]}')).toBe(false);
		expect(isCorruptLedgerText("{ truncated")).toBe(true);
		expect(isCorruptLedgerText('{"x":1}')).toBe(true);
	});
});

describe("loadLedger / saveLedger (injected IO)", () => {
	it("loadLedger returns an empty ledger when the reader yields null", () => {
		expect(loadLedger("/nope.json", () => null)).toEqual(EMPTY);
	});
	it("loadLedger returns empty for a present-but-corrupt ledger (and does not throw)", () => {
		expect(loadLedger("/corrupt.json", () => "{ truncated")).toEqual(EMPTY);
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

	it("round-trips through the real (atomic) default writer + loadLedger, leaving no .tmp", () => {
		const dir = mkdtempSync(join(tmpdir(), "fl-"));
		try {
			const path = join(dir, "sub", "ledger.json"); // nested dir → exercises mkdirSync
			const merged = mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1" });
			saveLedger({ path, ledger: merged.ledger });
			expect(loadLedger(path)).toEqual(merged.ledger);
			expect(existsSync(`${path}.tmp`)).toBe(false); // atomic rename left no temp behind
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("parseArgs", () => {
	it("parses the required flags and --write", () => {
		const args = parseArgs(["--ledger", "/l.json", "--head-sha", "abc", "--write"]);
		expect(args).toEqual({
			ledger: "/l.json",
			findings: undefined,
			headSha: "abc",
			write: true,
			runHash: undefined,
			checkCache: false,
		});
	});
	it("throws UsageError when --ledger is missing", () => {
		expect(() => parseArgs(["--head-sha", "abc"])).toThrow(UsageError);
	});
	it("throws UsageError when --head-sha is missing (merge mode)", () => {
		expect(() => parseArgs(["--ledger", "/l.json"])).toThrow(UsageError);
	});
	it("throws UsageError on an unknown flag", () => {
		expect(() => parseArgs(["--ledger", "/l.json", "--head-sha", "a", "--bogus"])).toThrow(
			UsageError,
		);
	});
	it("parses --check-cache + --run-hash without requiring --head-sha", () => {
		const args = parseArgs(["--ledger", "/l.json", "--check-cache", "--run-hash", "h1"]);
		expect(args.checkCache).toBe(true);
		expect(args.runHash).toBe("h1");
		expect(args.headSha).toBeUndefined();
	});
	it("throws UsageError when --check-cache is given without --run-hash", () => {
		expect(() => parseArgs(["--ledger", "/l.json", "--check-cache"])).toThrow(UsageError);
	});
});

describe("idempotency cache (issue #23)", () => {
	const seedFinding = () =>
		mergeLedger({ ledger: EMPTY, findings: [finding()], headSha: "sha1", runHash: "h1" });

	it("mergeLedger stamps last_run when given a runHash", () => {
		const out = seedFinding();
		expect(out.ledger.last_run).toEqual({ hash: "h1", head_sha: "sha1" });
	});

	it("mergeLedger preserves the prior last_run when no runHash is given", () => {
		const seeded = seedFinding().ledger;
		const next = mergeLedger({ ledger: seeded, findings: [finding()], headSha: "sha2" });
		expect(next.ledger.last_run).toEqual({ hash: "h1", head_sha: "sha1" });
	});

	it("isCacheHit matches the stored hash, and never matches an empty hash", () => {
		const ledger = seedFinding().ledger;
		expect(isCacheHit(ledger, "h1")).toBe(true);
		expect(isCacheHit(ledger, "h2")).toBe(false);
		expect(isCacheHit(ledger, "")).toBe(false);
		expect(isCacheHit(EMPTY, "h1")).toBe(false);
	});

	it("openFindings returns only open entries (wontfix + resolved excluded)", () => {
		const ledger = {
			findings: [
				{ ...finding(), id: "a", status: "open" as const },
				{ ...finding({ file: "b.ts" }), id: "b", status: "wontfix" as const },
				{ ...finding({ file: "c.ts" }), id: "c", status: "resolved" as const },
			].map((f) => ({
				id: f.id,
				file: f.file,
				line: 1,
				severity: "high" as const,
				description: "WHAT: x. FIX: y.",
				status: f.status,
				first_seen_sha: "s",
				last_seen_sha: "s",
				posted_comment_id: null,
			})),
		};
		expect(openFindings(ledger).map((f) => f.id)).toEqual(["a"]);
	});

	it("severityCounts tallies by severity", () => {
		expect(
			severityCounts([{ severity: "high" }, { severity: "high" }, { severity: "low" }]),
		).toEqual({ critical: 0, high: 2, medium: 0, low: 1 });
	});

	it("parseLedger round-trips a valid last_run and drops a malformed one", () => {
		const withRun = JSON.stringify({ findings: [], last_run: { hash: "h1", head_sha: "s1" } });
		expect(parseLedger(withRun).last_run).toEqual({ hash: "h1", head_sha: "s1" });
		const badRun = JSON.stringify({ findings: [], last_run: { hash: 5 } });
		expect(parseLedger(badRun).last_run).toBeUndefined();
	});

	it("buildCacheResult: hit returns open findings + counts; miss returns empty + null head_sha", () => {
		const seeded = seedFinding().ledger;
		const hit = buildCacheResult(seeded, "h1");
		expect(hit.cache_hit).toBe(true);
		expect(hit.head_sha).toBe("sha1");
		expect(hit.findings).toEqual(openFindings(seeded));
		expect(hit.counts.high).toBe(1);

		const miss = buildCacheResult(EMPTY, "h1");
		expect(miss.cache_hit).toBe(false);
		expect(miss.head_sha).toBeNull();
		expect(miss.findings).toEqual([]);
		expect(miss.counts).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
	});
});

describe("CLI from a path containing a space (the #42 isMain regression)", () => {
	it("runs main() when the checkout path is URL-special (was a silent no-op)", () => {
		// realpathSync so process.argv[1] is canonical (macOS tmpdir lives under the
		// /var → /private/var symlink, which import.meta.url resolves but argv[1] does
		// not — that mismatch is unrelated to the bug under test, the space is).
		const base = realpathSync(mkdtempSync(join(tmpdir(), "fl-space-")));
		const spacedDir = join(base, "has space");
		try {
			mkdirSync(spacedDir);
			// findings-ledger.ts imports only node builtins, so a single-file copy runs
			// standalone. Under a dir with a space the old guard's unencoded file:// URL
			// never matched the percent-encoded import.meta.url, so main() never ran and
			// the CLI exited 0 with empty stdout instead of merging the ledger.
			const spacedScript = join(spacedDir, "findings-ledger.ts");
			copyFileSync(join(import.meta.dirname, "findings-ledger.ts"), spacedScript);
			const out = execFileSync(
				"node",
				[spacedScript, "--ledger", join(spacedDir, "ledger.json"), "--head-sha", "deadbeef"],
				{ input: "[]", encoding: "utf8" },
			).trim();
			expect(out.length).toBeGreaterThan(0);
			expect(() => JSON.parse(out)).not.toThrow();
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});

describe("CLI --findings on an unreadable file (feedback #43)", () => {
	const SCRIPT = join(import.meta.dirname, "findings-ledger.ts");

	type ExecError = { status: number | null; stderr: string };
	const isExecError = (e: unknown): e is ExecError => {
		if (typeof e !== "object" || e === null) return false;
		return "status" in e && "stderr" in e && typeof e.stderr === "string";
	};

	it("exits 2 with a clear stderr message instead of degrading to an empty review", () => {
		const base = realpathSync(mkdtempSync(join(tmpdir(), "fl-missing-")));
		try {
			const missing = join(base, "does-not-exist.json");
			let caught: unknown;
			try {
				execFileSync(
					"node",
					[
						SCRIPT,
						"--ledger",
						join(base, "ledger.json"),
						"--head-sha",
						"deadbeef",
						"--findings",
						missing,
					],
					{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
				);
			} catch (error) {
				caught = error;
			}
			expect(isExecError(caught)).toBe(true);
			if (!isExecError(caught)) return;
			expect(caught.status).toBe(2);
			expect(caught.stderr).toContain("cannot read --findings file");
			expect(caught.stderr).toContain(missing);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("does NOT overwrite the ledger (preserving wontfix marks) when --findings is unreadable under --write", () => {
		const base = realpathSync(mkdtempSync(join(tmpdir(), "fl-preserve-")));
		try {
			const ledgerPath = join(base, "ledger.json");
			// Seed an open + a wontfix finding; a degraded empty review would mark both
			// resolved on --write, the exact data loss feedback #43 prevents.
			const seeded = mergeLedger({
				ledger: EMPTY,
				findings: [finding({ file: "open.ts" }), finding({ file: "keep.ts" })],
				headSha: "seedsha",
			}).ledger;
			const withWontfix = {
				...seeded,
				findings: seeded.findings.map((f, i) =>
					i === 0 ? { ...f, status: "wontfix" as const } : f,
				),
			};
			saveLedger({ path: ledgerPath, ledger: withWontfix });
			const before = readFileSync(ledgerPath, "utf8");

			let caught: unknown;
			try {
				execFileSync(
					"node",
					[
						SCRIPT,
						"--ledger",
						ledgerPath,
						"--head-sha",
						"newsha",
						"--findings",
						join(base, "nope.json"),
						"--write",
					],
					{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
				);
			} catch (error) {
				caught = error;
			}
			expect(isExecError(caught)).toBe(true);
			if (isExecError(caught)) expect(caught.status).toBe(2);
			// Ledger file untouched: no resolve sweep, wontfix mark intact.
			expect(readFileSync(ledgerPath, "utf8")).toBe(before);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});

describe("CLI --findings file read branch (feedback #43)", () => {
	const SCRIPT = join(import.meta.dirname, "findings-ledger.ts");

	type ExecError = { status: number | null; stderr: string };
	const isExecError = (e: unknown): e is ExecError => {
		if (typeof e !== "object" || e === null) return false;
		return "status" in e && "stderr" in e && typeof e.stderr === "string";
	};

	it("reads a valid --findings file, exits 0, and merges its findings", () => {
		const base = realpathSync(mkdtempSync(join(tmpdir(), "fl-read-")));
		try {
			const findingsPath = join(base, "findings.json");
			writeFileSync(findingsPath, JSON.stringify([finding({ file: "new.ts" })]));
			const out = execFileSync(
				"node",
				[
					SCRIPT,
					"--ledger",
					join(base, "ledger.json"),
					"--head-sha",
					"abc123",
					"--findings",
					findingsPath,
				],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
			);
			const result = JSON.parse(out);
			expect(result.net_new).toHaveLength(1);
			expect(result.net_new[0].file).toBe("new.ts");
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("exits 2 on a readable but invalid-JSON --findings file instead of degrading to an empty review", () => {
		const base = realpathSync(mkdtempSync(join(tmpdir(), "fl-badjson-")));
		try {
			const findingsPath = join(base, "corrupt.json");
			writeFileSync(findingsPath, "{ truncated");
			let caught: unknown;
			try {
				execFileSync(
					"node",
					[
						SCRIPT,
						"--ledger",
						join(base, "ledger.json"),
						"--head-sha",
						"deadbeef",
						"--findings",
						findingsPath,
					],
					{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
				);
			} catch (error) {
				caught = error;
			}
			expect(isExecError(caught)).toBe(true);
			if (!isExecError(caught)) return;
			expect(caught.status).toBe(2);
			expect(caught.stderr).toContain("not valid JSON");
			expect(caught.stderr).toContain(findingsPath);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});

describe("CLI stdin path (feedback #43 — preserved degrade-to-empty)", () => {
	const SCRIPT = join(import.meta.dirname, "findings-ledger.ts");

	it("degrades malformed stdin JSON to a clean empty merge and exits 0 (no --findings)", () => {
		// The exit-2 hardening is scoped to an explicit --findings file; the stdin
		// path must still treat unparseable input as "no findings" so a caller can
		// pass `echo '[]'` (or nothing). This guards that branch from regressing to
		// exit 2, which would break that contract.
		const base = realpathSync(mkdtempSync(join(tmpdir(), "fl-stdin-")));
		try {
			const out = execFileSync(
				"node",
				[SCRIPT, "--ledger", join(base, "ledger.json"), "--head-sha", "abc123"],
				{ input: "{ truncated", encoding: "utf8" },
			);
			const result = JSON.parse(out);
			expect(result.net_new).toHaveLength(0);
			expect(result.resolved).toHaveLength(0);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});
