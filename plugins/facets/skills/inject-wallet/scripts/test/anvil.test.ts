import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAnvilArgs, startAnvil } from "../lib/anvil.ts";
import { fakeChild } from "./fake-child.ts";

describe("buildAnvilArgs", () => {
	it("always sets the port", () => {
		expect(buildAnvilArgs({ port: 8545 })).toEqual(["--port", "8545"]);
	});

	it("adds chain-id and fork-url when provided", () => {
		expect(buildAnvilArgs({ port: 8546, chainId: 8453, forkUrl: "https://rpc.example" })).toEqual([
			"--port",
			"8546",
			"--chain-id",
			"8453",
			"--fork-url",
			"https://rpc.example",
		]);
	});
});

describe("startAnvil", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("returns chainId + first account once the node answers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init: { body: string }) => {
				const method = JSON.parse(init.body).method;
				const result = method === "eth_chainId" ? "0x7a69" : ["0xAbC"];
				return { json: async () => ({ result }) };
			}),
		);
		const handle = await startAnvil({
			port: 8545,
			log: () => undefined,
			spawnAnvil: () => fakeChild(),
			timeoutMs: 1000,
			pollMs: 5,
		});
		expect(handle.rpcUrl).toBe("http://127.0.0.1:8545");
		expect(handle.chainId).toBe(31337);
		expect(handle.address).toBe("0xAbC");
	});

	it("throws when anvil exits early", async () => {
		await expect(
			startAnvil({
				port: 8545,
				log: () => undefined,
				spawnAnvil: () => fakeChild(1),
				timeoutMs: 1000,
				pollMs: 5,
			}),
		).rejects.toThrow(/exited early/);
	});
});
