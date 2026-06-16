import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	driveAndScreenshot,
	hasAgentBrowser,
	parseConnectStatus,
	stripToJs,
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

describe("hasAgentBrowser", () => {
	it("returns a boolean for the agent-browser PATH probe", () => {
		expect(typeof hasAgentBrowser()).toBe("boolean");
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
