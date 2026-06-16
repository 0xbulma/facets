import { afterEach, describe, expect, it, vi } from "vitest";
import { backendLabel, computeExitCode, formatReport, queryChainId } from "../inject-wallet.ts";
import type { RouteResult } from "../lib/types.ts";

const route = (partial: Partial<RouteResult>): RouteResult => ({
	route: "/",
	url: "http://localhost:3000/",
	navigated: true,
	connected: false,
	consoleErrors: [],
	...partial,
});

describe("formatReport", () => {
	it("renders human lines + a parseable RESULT_JSON tail", () => {
		const out = formatReport({
			mode: "inject",
			backend: "anvil(31337)",
			appUrl: "http://localhost:3000",
			command: "pnpm run dev",
			results: [
				{
					route: "/",
					url: "http://localhost:3000/",
					navigated: true,
					connected: true,
					consoleErrors: [],
					screenshot: "/x/root.png",
				},
				{
					route: "/bad",
					url: "http://localhost:3000/bad",
					navigated: true,
					connected: false,
					consoleErrors: [],
					error: "boom",
				},
			],
		});
		expect(out).toContain("/ -> connected=true  shot=/x/root.png");
		expect(out).toContain("/bad -> error=boom");
		const tail = out.split("RESULT_JSON=")[1] ?? "{}";
		expect(JSON.parse(tail).routes).toHaveLength(2);
	});
});

describe("queryChainId", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("parses the hex chainId", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ json: async () => ({ result: "0x2105" }) })),
		);
		expect(await queryChainId("http://x")).toBe(8453);
	});

	it("throws on a non-string result", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ json: async () => ({ result: null }) })),
		);
		await expect(queryChainId("http://x")).rejects.toThrow(/could not read chainId/);
	});
});

describe("backendLabel", () => {
	it("labels anvil, anvil-fork, and rpc backends", () => {
		expect(backendLabel({ kind: "anvil", port: 8545 }, 31337)).toBe("anvil(31337)");
		expect(backendLabel({ kind: "anvil", port: 8545, forkUrl: "https://x" }, 8453)).toBe(
			"anvil(8453) fork",
		);
		expect(backendLabel({ kind: "rpc", rpcUrl: "https://x" }, 1)).toBe("rpc(1)");
	});
});

describe("computeExitCode", () => {
	it("0 when every route connected or screenshotted; 2 on error", () => {
		expect(computeExitCode([route({ connected: true })], "inject")).toBe(0);
		expect(computeExitCode([route({ connected: false, screenshot: "/x.png" })], "inject")).toBe(0);
		expect(computeExitCode([route({ error: "boom" })], "inject")).toBe(2);
	});

	it("2 in inject mode when a route neither connected nor screenshotted", () => {
		expect(computeExitCode([route({ connected: false })], "inject")).toBe(2);
	});

	it("0 in mock mode even when not connected (connection is app-handled)", () => {
		expect(computeExitCode([route({ connected: false })], "mock")).toBe(0);
		// ...but still 2 if a route errored, regardless of mode.
		expect(computeExitCode([route({ error: "x" })], "mock")).toBe(2);
	});
});
