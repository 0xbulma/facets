import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	type AbProbe,
	type AbRunner,
	agentBrowserError,
	driveAndScreenshot,
	parseAgentBrowserVersion,
	parseConnectStatus,
	probeAgentBrowser,
	stripToJs,
	summarizeDoctor,
} from "../lib/browser.ts";

const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(here, "..");
const tmpDirs: string[] = [];
const tmp = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "web3ss-browser-"));
	tmpDirs.push(dir);
	return dir;
};
afterEach(() => {
	for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("stripToJs", () => {
	it("strips a .ts file to a runnable classic .js script", () => {
		const dir = tmp();
		const src = join(dir, "in.ts");
		writeFileSync(src, "function add(a: number, b: number): number { return a + b; }\n", "utf8");
		const out = stripToJs(src, join(dir, "out.js"));
		const js = readFileSync(out, "utf8");
		expect(js).not.toMatch(/: number/);
		expect(() => new Function(js)).not.toThrow();
	});
});

const okProbe: AbProbe = { status: 0, stdout: "", stderr: "" };
// Fake runner that answers `--version` and `doctor` from a fixture map.
const fakeRunner = (resp: { version?: Partial<AbProbe>; doctor?: Partial<AbProbe> }): AbRunner => {
	return (args) => ({ ...okProbe, ...(args[0] === "doctor" ? resp.doctor : resp.version) });
};

describe("parseAgentBrowserVersion", () => {
	it("pulls the semver out of the version banner; null on junk", () => {
		expect(parseAgentBrowserVersion("agent-browser 0.27.3")).toBe("0.27.3");
		expect(parseAgentBrowserVersion("v1.2.30 (macos)")).toBe("1.2.30");
		expect(parseAgentBrowserVersion("no version here")).toBeNull();
		expect(parseAgentBrowserVersion("")).toBeNull();
	});
});

describe("summarizeDoctor", () => {
	it("keeps only fail/warn/Summary lines", () => {
		const out = summarizeDoctor(
			"Chrome\n  pass  Home dir\n  fail  Chrome not installed\n  warn  low disk\nSummary: 6 pass, 1 warn, 1 fail",
		);
		expect(out).toBe("fail  Chrome not installed\nwarn  low disk\nSummary: 6 pass, 1 warn, 1 fail");
	});

	it("falls back to the trimmed whole when nothing matches", () => {
		expect(summarizeDoctor("  some opaque output  ")).toBe("some opaque output");
	});
});

describe("probeAgentBrowser", () => {
	it("missing when the CLI is not on PATH (ENOENT)", () => {
		const status = probeAgentBrowser(fakeRunner({ version: { status: null, errCode: "ENOENT" } }));
		expect(status).toEqual({ kind: "missing" });
	});

	it("broken when --version exits non-zero", () => {
		const status = probeAgentBrowser(fakeRunner({ version: { status: 1, stderr: "boom" } }));
		expect(status).toEqual({ kind: "broken", detail: "boom" });
	});

	it("broken when --version output has no parseable semver", () => {
		const status = probeAgentBrowser(fakeRunner({ version: { status: 0, stdout: "weird" } }));
		expect(status).toMatchObject({ kind: "broken" });
	});

	it("broken with the spawn error code when a non-ENOENT spawn fails (e.g. EACCES)", () => {
		const status = probeAgentBrowser(fakeRunner({ version: { status: null, errCode: "EACCES" } }));
		expect(status).toEqual({ kind: "broken", detail: "spawn error: EACCES" });
	});

	it("no-browser when doctor exits non-zero", () => {
		const status = probeAgentBrowser(
			fakeRunner({
				version: { status: 0, stdout: "agent-browser 0.27.3" },
				doctor: {
					status: 1,
					stdout: "  fail  Chrome not installed\nSummary: 7 pass, 0 warn, 1 fail",
				},
			}),
		);
		expect(status.kind).toBe("no-browser");
		if (status.kind === "no-browser") expect(status.detail).toContain("fail  Chrome not installed");
	});

	it("ready when --version parses and doctor passes", () => {
		const status = probeAgentBrowser(
			fakeRunner({ version: { status: 0, stdout: "agent-browser 0.27.3" }, doctor: { status: 0 } }),
		);
		expect(status).toEqual({ kind: "ready", version: "0.27.3" });
	});

	it("real default runner returns a valid status kind (CI may lack the CLI)", () => {
		expect(["ready", "missing", "broken", "no-browser"]).toContain(probeAgentBrowser().kind);
	});
});

describe("agentBrowserError", () => {
	it("returns null only when ready", () => {
		expect(agentBrowserError({ kind: "ready", version: "0.27.3" })).toBeNull();
	});

	it("missing → install steps", () => {
		const msg = agentBrowserError({ kind: "missing" });
		expect(msg).toContain("not found on PATH");
		expect(msg).toContain("npm i -g agent-browser && agent-browser install");
		expect(msg).toContain("--dry-run");
	});

	it("no-browser → `agent-browser install` + the doctor detail", () => {
		const msg = agentBrowserError({ kind: "no-browser", detail: "fail  Chrome not installed" });
		expect(msg).toContain("agent-browser install");
		expect(msg).toContain("doctor --fix");
		expect(msg).toContain("Chrome not installed");
	});

	it("broken → reinstall guidance + the detail", () => {
		const msg = agentBrowserError({ kind: "broken", detail: "segfault" });
		expect(msg).toContain("did not run");
		expect(msg).toContain("reinstall");
		expect(msg).toContain("segfault");
	});
});

describe("parseConnectStatus", () => {
	it("reads connected + error from JSON, tolerates junk", () => {
		expect(parseConnectStatus('{"connected":true,"address":"0xabc"}')).toEqual({
			connected: true,
			error: undefined,
		});
		expect(parseConnectStatus('{"connected":false,"error":"nope"}')).toEqual({
			connected: false,
			error: "nope",
		});
		expect(parseConnectStatus("not json")).toEqual({ connected: false });
		expect(parseConnectStatus("")).toEqual({ connected: false });
	});
});

describe("driveAndScreenshot (dry-run)", () => {
	it("plans navigate + screenshot per route without spawning a browser", async () => {
		const outDir = tmp();
		const workDir = tmp();
		const logs: string[] = [];
		const results = await driveAndScreenshot({
			baseUrl: "http://localhost:3000",
			routes: ["/", "/app"],
			walletConfig: { address: "0xabc", chainId: 31337, rpcUrl: "http://127.0.0.1:8545" },
			outDir,
			workDir,
			providerTs: join(scriptsDir, "provider.ts"),
			connectAppkitTs: join(scriptsDir, "connect-appkit.ts"),
			mode: "inject",
			log: (s) => logs.push(s),
			dryRun: true,
		});

		expect(results.map((r) => r.route)).toEqual(["/", "/app"]);
		expect(results.every((r) => r.navigated && !r.error)).toBe(true);
		expect(results[0]?.screenshot).toMatch(/root\.png$/);
		expect(results[1]?.screenshot).toMatch(/app\.png$/);
		// inject mode wrote the seed config + the stripped provider into the work dir.
		expect(existsSync(join(workDir, "wallet-config.js"))).toBe(true);
		expect(readFileSync(join(workDir, "wallet-config.js"), "utf8")).toContain(
			"window.e2eWalletConfig",
		);
		expect(logs.some((l) => l.includes("--init-script"))).toBe(true);
	});
});
