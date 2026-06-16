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

	it("parses --impersonate and implies it as the connected address", () => {
		const addr = "0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
		const opts = parseArgs(["--rpc", "https://mainnet.example", "--impersonate", addr]);
		expect(opts.impersonate).toBe(addr);
	});

	it("validates --impersonate and --address as 0x-addresses", () => {
		expect(() => parseArgs(["--impersonate", "not-an-address"])).toThrow(/20-byte address/);
		expect(() => parseArgs(["--address", "0x1234"])).toThrow(/20-byte address/);
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
