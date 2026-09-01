import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildCoupling,
	DEFAULT_OPTIONS,
	parseArgs,
	parseChangedLines,
	parseLog,
	type SweepInput,
	sweep,
	UsageError,
} from "./couple-sweep.ts";

const ALWAYS = () => true;

function input(over: Partial<SweepInput> = {}): SweepInput {
	return { commits: [], changedLines: {}, exists: ALWAYS, ...over };
}

/** `n` commits that each touched both files — the canonical mirror pair. */
function coupled(n: number, pair: [string, string]): string[][] {
	return Array.from({ length: n }, () => [...pair]);
}

describe("buildCoupling", () => {
	it("counts commits per file and per ordered pair", () => {
		const { totals, pairs } = buildCoupling([["a", "b"], ["a", "b"], ["a"]]);
		expect(totals.get("a")).toBe(3);
		expect(totals.get("b")).toBe(2);
		expect(pairs.get("a")?.get("b")).toBe(2);
		expect(pairs.get("b")?.get("a")).toBe(2);
	});

	it("counts a solo commit toward the total, so changing alone lowers confidence", () => {
		const both = buildCoupling(coupled(3, ["a", "b"]));
		expect((both.pairs.get("a")?.get("b") ?? 0) / (both.totals.get("a") ?? 1)).toBe(1);

		const diluted = buildCoupling([...coupled(3, ["a", "b"]), ["a"], ["a"]]);
		expect((diluted.pairs.get("a")?.get("b") ?? 0) / (diluted.totals.get("a") ?? 1)).toBe(0.6);
	});

	it("ignores a mass-edit commit that would couple everything to everything", () => {
		const massEdit = Array.from({ length: DEFAULT_OPTIONS.maxCommitFiles + 1 }, (_, i) => `f${i}`);
		const { totals, pairs } = buildCoupling([massEdit]);
		expect(totals.size).toBe(0);
		expect(pairs.size).toBe(0);
	});

	it("does not couple a file to itself when a commit lists it twice", () => {
		const { totals, pairs } = buildCoupling([["a", "a"]]);
		expect(totals.get("a")).toBe(1);
		expect(pairs.get("a")?.size ?? 0).toBe(0);
	});
});

describe("sweep", () => {
	it("flags a strongly-coupled partner that is missing from the diff", () => {
		const { findings } = sweep(
			input({ commits: coupled(4, ["a.md", "b.md"]), changedLines: { "a.md": [12, 40] } }),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.file).toBe("a.md");
		expect(findings[0]?.line).toBe(12);
		expect(findings[0]?.severity).toBe("medium");
		expect(findings[0]?.description).toContain("`b.md`");
		expect(findings[0]?.description).toContain("WHAT:");
		expect(findings[0]?.description).toContain("FIX:");
		expect(findings[0]?.description).toContain("4 of its last 4 commits (100%)");
	});

	it("stays silent when the partner is already in the diff", () => {
		const { findings } = sweep(
			input({
				commits: coupled(4, ["a.md", "b.md"]),
				changedLines: { "a.md": [1], "b.md": [1] },
			}),
		);
		expect(findings).toEqual([]);
	});

	it("stays silent below the support floor, however confident the ratio", () => {
		const { findings } = sweep(
			input({ commits: coupled(2, ["a.md", "b.md"]), changedLines: { "a.md": [1] } }),
		);
		expect(findings).toEqual([]);
	});

	it("stays silent below the confidence floor, however much support", () => {
		const commits = [...coupled(4, ["a.md", "b.md"]), ...Array.from({ length: 6 }, () => ["a.md"])];
		const { findings } = sweep(input({ commits, changedLines: { "a.md": [1] } }));
		expect(findings).toEqual([]);
	});

	it("stays silent when the partner no longer exists on disk", () => {
		const { findings } = sweep(
			input({
				commits: coupled(4, ["a.md", "deleted.md"]),
				changedLines: { "a.md": [1] },
				exists: () => false,
			}),
		);
		expect(findings).toEqual([]);
	});

	it("surfaces EVERY drifted pair in one pass (the feedback #64 nit-tail)", () => {
		const commits = [
			...coupled(4, ["one.md", "one.mirror.md"]),
			...coupled(4, ["two.md", "two.mirror.md"]),
			...coupled(4, ["three.md", "three.mirror.md"]),
		];
		const { findings } = sweep(
			input({ commits, changedLines: { "one.md": [1], "two.md": [1], "three.md": [1] } }),
		);
		expect(findings.map((f) => f.file).sort()).toEqual(["one.md", "three.md", "two.md"]);
	});

	it("anchors on line 1 when the file has no changed lines (pure rename)", () => {
		const { findings } = sweep(
			input({ commits: coupled(4, ["a.md", "b.md"]), changedLines: { "a.md": [] } }),
		);
		expect(findings[0]?.line).toBe(1);
	});

	it("caps a heuristic's confidence below the fully-proven band", () => {
		const { findings } = sweep(
			input({ commits: coupled(9, ["a.md", "b.md"]), changedLines: { "a.md": [1] } }),
		);
		expect(findings[0]?.confidence).toBe(85);
	});

	it("is asymmetric — a hub file changed alone does not flag its many satellites", () => {
		// b.md always accompanies a.md, but a.md accompanies b.md only 4 of 20 times.
		const commits = [
			...coupled(4, ["a.md", "b.md"]),
			...Array.from({ length: 16 }, () => ["a.md"]),
		];
		expect(sweep(input({ commits, changedLines: { "a.md": [1] } })).findings).toEqual([]);
		expect(sweep(input({ commits, changedLines: { "b.md": [1] } })).findings).toHaveLength(1);
	});

	it("orders by confidence and reports how many the cap dropped", () => {
		const commits: string[][] = [];
		for (let i = 0; i < DEFAULT_OPTIONS.maxFindings + 3; i += 1) {
			commits.push(...coupled(4, [`src${i}.md`, `mirror${i}.md`]));
		}
		const changedLines = Object.fromEntries(
			Array.from({ length: DEFAULT_OPTIONS.maxFindings + 3 }, (_, i) => [`src${i}.md`, [1]]),
		);
		const result = sweep(input({ commits, changedLines }));
		expect(result.findings).toHaveLength(DEFAULT_OPTIONS.maxFindings);
		expect(result.truncated).toBe(3);
	});

	it("honors overridden thresholds", () => {
		const args = input({ commits: coupled(2, ["a.md", "b.md"]), changedLines: { "a.md": [1] } });
		expect(sweep(args).findings).toEqual([]);
		expect(sweep(args, { ...DEFAULT_OPTIONS, minSupport: 2 }).findings).toHaveLength(1);
	});
});

describe("parseLog", () => {
	it("splits commits on the @sha marker and drops blank separators", () => {
		const raw = "@aaaaaaa\nf1\nf2\n\n@bbbbbbb\nf3\n";
		expect(parseLog(raw)).toEqual([["f1", "f2"], ["f3"]]);
	});

	it("keeps a merge commit that lists no files as an empty commit", () => {
		expect(parseLog("@aaaaaaa\n\n@bbbbbbb\nf1\n")).toEqual([[], ["f1"]]);
	});

	it("ignores output before the first commit marker", () => {
		expect(parseLog("stray\n@aaaaaaa\nf1\n")).toEqual([["f1"]]);
	});
});

describe("parseChangedLines", () => {
	it("keeps integer line arrays and drops malformed values", () => {
		expect(parseChangedLines('{"a.ts":[1,2],"b.ts":"nope","c.ts":[3,"x",4.5]}')).toEqual({
			"a.ts": [1, 2],
			"c.ts": [3],
		});
	});

	it("rejects a non-object payload", () => {
		expect(() => parseChangedLines("[]")).toThrow(UsageError);
		expect(() => parseChangedLines("null")).toThrow(UsageError);
	});
});

describe("parseArgs", () => {
	it("parses both required flags in either order", () => {
		expect(parseArgs(["--changed-lines", "cl.json", "--base", "abc"])).toEqual({
			base: "abc",
			changedLines: "cl.json",
		});
	});

	it("throws when either flag is missing", () => {
		expect(() => parseArgs(["--base", "abc"])).toThrow(UsageError);
		expect(() => parseArgs(["--changed-lines", "cl.json"])).toThrow(UsageError);
	});
});

describe("CLI (real git fixture)", () => {
	const SCRIPT = join(import.meta.dirname, "couple-sweep.ts");

	function fixture(): { dir: string; base: string } {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), "cs-")));
		const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
		g("init", "-q");
		g("config", "user.email", "a@b.c");
		g("config", "user.name", "x");
		g("config", "commit.gpgsign", "false"); // must not depend on the dev's signing agent
		for (let i = 0; i < 4; i += 1) {
			writeFileSync(join(dir, "skill.md"), `skill v${i}\n`);
			writeFileSync(join(dir, "mirror.md"), `mirror v${i}\n`);
			g("add", "skill.md", "mirror.md");
			g("commit", "-qm", `sync ${i}`);
		}
		return { dir, base: g("rev-parse", "HEAD").trim() };
	}

	it("reports the coupled partner left out of the diff", () => {
		const { dir, base } = fixture();
		try {
			writeFileSync(join(dir, "changed-lines.json"), JSON.stringify({ "skill.md": [1] }));
			const out = execFileSync(
				"node",
				[SCRIPT, "--base", base, "--changed-lines", join(dir, "changed-lines.json")],
				{ cwd: dir, encoding: "utf8" },
			);
			const findings = JSON.parse(out);
			expect(findings).toHaveLength(1);
			expect(findings[0].file).toBe("skill.md");
			expect(findings[0].description).toContain("`mirror.md`");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("emits [] when both halves of the pair are in the diff", () => {
		const { dir, base } = fixture();
		try {
			writeFileSync(
				join(dir, "changed-lines.json"),
				JSON.stringify({ "skill.md": [1], "mirror.md": [1] }),
			);
			const out = execFileSync(
				"node",
				[SCRIPT, "--base", base, "--changed-lines", join(dir, "changed-lines.json")],
				{ cwd: dir, encoding: "utf8" },
			);
			expect(JSON.parse(out)).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("exits 2 on CLI misuse rather than emitting findings", () => {
		try {
			execFileSync("node", [SCRIPT, "--base", "abc"], { encoding: "utf8", stdio: "pipe" });
			expect.unreachable("expected a non-zero exit");
		} catch (error) {
			expect(error instanceof Error && "status" in error && error.status).toBe(2);
		}
	});

	it("runs from a path containing a space (the #42 isMain regression)", () => {
		const { dir, base } = fixture();
		const spacedBase = realpathSync(mkdtempSync(join(tmpdir(), "cs-space-")));
		const spacedDir = join(spacedBase, "has space");
		try {
			mkdirSync(spacedDir);
			// couple-sweep.ts imports only node builtins, so a single-file copy runs standalone.
			const spacedScript = join(spacedDir, "couple-sweep.ts");
			copyFileSync(SCRIPT, spacedScript);
			writeFileSync(join(dir, "changed-lines.json"), JSON.stringify({ "skill.md": [1] }));
			const out = execFileSync(
				"node",
				[spacedScript, "--base", base, "--changed-lines", join(dir, "changed-lines.json")],
				{ cwd: dir, encoding: "utf8" },
			);
			expect(JSON.parse(out)).toHaveLength(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
			rmSync(spacedBase, { recursive: true, force: true });
		}
	});
});
