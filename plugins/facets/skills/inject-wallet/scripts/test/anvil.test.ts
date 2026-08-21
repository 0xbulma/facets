import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAnvilArgs, formatAnvilCommand, startAnvil } from "../lib/anvil.ts";
import type { ChildLike } from "../lib/child.ts";
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

	it("redacts fork credentials from logs", () => {
		expect(
			formatAnvilCommand(["--port", "8545", "--fork-url", "https://user:key@rpc.example"]),
		).toBe("anvil --port 8545 --fork-url <redacted>");
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

	it("redacts the fork url from anvil's own output in failure messages", async () => {
		// anvil echoes the fork endpoint in its startup banner and in reqwest
		// errors; that output is buffered into `tail` and interpolated into the
		// thrown message, which main() prints to stderr. Redacting only the logged
		// argv (formatAnvilCommand) would leave the credential in this path.
		const forkUrl = "https://eth-mainnet.example/v2/SUPERSECRETKEY";
		const banner = `Fork\n  Endpoint:       ${forkUrl}\n`;
		const child: ChildLike = {
			stdout: { on: (_event, cb) => cb(Buffer.from(banner)) },
			stderr: { on: () => undefined },
			on: () => undefined,
			exitCode: 1,
			killed: false,
			kill: () => undefined,
		};
		const err = await startAnvil({
			port: 8545,
			forkUrl,
			log: () => undefined,
			spawnAnvil: () => child,
			timeoutMs: 1000,
			pollMs: 5,
		}).catch((e: unknown) => e);
		const message = err instanceof Error ? err.message : String(err);
		expect(message).toContain("exited early");
		expect(message).toContain("<redacted>");
		expect(message).not.toContain("SUPERSECRETKEY");
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
