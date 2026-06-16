import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "../lib/args.ts";

describe("parseArgs", () => {
	it('defaults to anvil backend, inject mode, route "/"', () => {
		const opts = parseArgs([]);
		expect(opts.backend).toEqual({ kind: "anvil", port: 8545, forkUrl: undefined });
		expect(opts.mode).toBe("inject");
		expect(opts.routes).toEqual(["/"]);
		expect(opts.teardown).toBe(true);
	});

	it("collects repeated --url and splits --routes", () => {
		expect(parseArgs(["--url", "/", "--url", "/app"]).routes).toEqual(["/", "/app"]);
		expect(parseArgs(["--routes", "/a, /b ,/c"]).routes).toEqual(["/a", "/b", "/c"]);
	});

	it("parses an anvil fork backend with options", () => {
		const opts = parseArgs([
			"--anvil",
			"--fork-url",
			"https://rpc.example",
			"--anvil-port",
			"9001",
			"--chain-id",
			"8453",
		]);
		expect(opts.backend).toEqual({ kind: "anvil", port: 9001, forkUrl: "https://rpc.example" });
		expect(opts.chainId).toBe(8453);
	});

	it("parses a read-only rpc backend", () => {
		expect(parseArgs(["--rpc", "https://mainnet.example"]).backend).toEqual({
			kind: "rpc",
			rpcUrl: "https://mainnet.example",
		});
	});

	it("rejects --rpc together with --anvil", () => {
		expect(() => parseArgs(["--rpc", "https://x", "--anvil"])).toThrow(UsageError);
	});

	it("validates --mode", () => {
		expect(parseArgs(["--mode", "mock"]).mode).toBe("mock");
		expect(() => parseArgs(["--mode", "bogus"])).toThrow(/inject\|mock/);
	});

	it("rejects a flag missing its value, and unknown flags", () => {
		expect(() => parseArgs(["--port"])).toThrow(/requires a value/);
		expect(() => parseArgs(["--bogus"])).toThrow(/unknown argument/);
	});

	it("treats -h/--help as an empty UsageError", () => {
		expect(() => parseArgs(["--help"])).toThrow(UsageError);
		try {
			parseArgs(["-h"]);
		} catch (err) {
			expect(err instanceof UsageError && err.message).toBe("");
		}
	});
});
