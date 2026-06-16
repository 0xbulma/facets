import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	detectPackageManager,
	detectScript,
	portFromScript,
	resolveDevCommand,
	startDevServer,
} from "../lib/dev-server.ts";
import { fakeChild } from "./fake-child.ts";

const tmpDirs: string[] = [];
function fixture(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "web3ss-dev-"));
	tmpDirs.push(dir);
	for (const [name, content] of Object.entries(files))
		writeFileSync(join(dir, name), content, "utf8");
	return dir;
}

afterEach(() => {
	for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("dev-server detection", () => {
	it("prefers dev > start > first dev/serve-prefixed script", () => {
		expect(detectScript({ build: "x", dev: "y", start: "z" })).toBe("dev");
		expect(detectScript({ build: "x", start: "z" })).toBe("start");
		expect(detectScript({ serveSite: "y" })).toBe("serveSite");
		expect(detectScript({ build: "x" })).toBeUndefined();
	});

	it("reads an explicit port from the script body", () => {
		expect(portFromScript("next dev -p 4000", 3000)).toBe(4000);
		expect(portFromScript("vite --port=5173", 3000)).toBe(5173);
		expect(portFromScript("next dev", 3000)).toBe(3000);
	});

	it("detects the package manager from the lockfile", () => {
		expect(detectPackageManager(fixture({ "pnpm-lock.yaml": "" }))).toBe("pnpm");
		expect(detectPackageManager(fixture({ "yarn.lock": "" }))).toBe("yarn");
		expect(detectPackageManager(fixture({}))).toBe("npm");
	});

	it("resolves the dev command from package.json + lockfile", () => {
		const dir = fixture({
			"package.json": JSON.stringify({ scripts: { dev: "next dev -p 4100" } }),
			"pnpm-lock.yaml": "",
		});
		expect(resolveDevCommand({ cwd: dir, fallbackPort: 3000 })).toEqual({
			command: "pnpm run dev",
			port: 4100,
		});
	});

	it("honors an override command", () => {
		expect(
			resolveDevCommand({ cwd: "/nope", override: "bun run dev", fallbackPort: 3001 }),
		).toEqual({
			command: "bun run dev",
			port: 3001,
		});
	});

	it("throws when no script and no override", () => {
		const dir = fixture({ "package.json": JSON.stringify({ scripts: { build: "x" } }) });
		expect(() => resolveDevCommand({ cwd: dir, fallbackPort: 3000 })).toThrow(
			/no dev\/start\/serve/,
		);
	});
});

describe("startDevServer", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("returns the url once the server answers < 500", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ status: 200 })),
		);
		const handle = await startDevServer({
			cwd: "/tmp",
			command: "next dev",
			port: 3000,
			log: () => undefined,
			spawnDev: () => fakeChild(),
			timeoutMs: 1000,
			pollMs: 5,
		});
		expect(handle.url).toBe("http://localhost:3000");
		expect(handle.command).toBe("next dev");
	});

	it("throws when the dev server exits early", async () => {
		await expect(
			startDevServer({
				cwd: "/tmp",
				command: "x",
				port: 3000,
				log: () => undefined,
				spawnDev: () => fakeChild(1),
				timeoutMs: 1000,
				pollMs: 5,
			}),
		).rejects.toThrow(/exited early/);
	});
});
