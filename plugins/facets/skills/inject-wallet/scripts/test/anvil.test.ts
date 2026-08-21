import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAnvilArgs, makeRedactor, startAnvil } from "../lib/anvil.ts";
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
});

describe("makeRedactor", () => {
	it("is the identity when there is no fork url", () => {
		expect(makeRedactor(undefined)("anvil --port 8545")).toBe("anvil --port 8545");
	});

	it("scrubs every occurrence, case-insensitively", () => {
		const redact = makeRedactor("https://Eth-Mainnet.example/v2/KEY");
		expect(
			redact("--fork-url https://eth-mainnet.example/v2/KEY (https://Eth-Mainnet.example/v2/KEY)"),
		).toBe("--fork-url <redacted> (<redacted>)");
	});

	it("treats regex metacharacters in the url as literals", () => {
		const redact = makeRedactor("https://rpc.example/v2/a+b?c=1");
		expect(redact("url https://rpc.example/v2/a+b?c=1 end")).toBe("url <redacted> end");
		expect(redact("url https://rpcXexample/v2/aab?c=1 end")).toContain("rpcXexample");
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
		// Deliberately split the URL across two `data` chunks: a stream handler sees
		// arbitrary boundaries, and neither half contains the whole URL.
		const banner = `Fork\n  Endpoint:       ${forkUrl}\n`;
		const cut = banner.indexOf("SUPERSECRET") + 5;
		const chunks = [banner.slice(0, cut), banner.slice(cut)];
		const logs: string[] = [];
		const child: ChildLike = {
			stdout: {
				on: (_event, cb) => {
					for (const c of chunks) cb(Buffer.from(c));
				},
			},
			stderr: { on: () => undefined },
			on: () => undefined,
			exitCode: 1,
			killed: false,
			kill: () => undefined,
		};
		const err = await startAnvil({
			port: 8545,
			forkUrl,
			log: (line) => logs.push(line),
			spawnAnvil: () => child,
			timeoutMs: 1000,
			pollMs: 5,
		}).catch((e: unknown) => e);
		const message = err instanceof Error ? err.message : String(err);
		expect(message).toContain("exited early");
		expect(message).toContain("<redacted>");
		expect(message).not.toContain("SUPERSECRETKEY");
		// The logged argv goes through the same single redactor.
		expect(logs.join("\n")).toContain("--fork-url <redacted>");
		expect(logs.join("\n")).not.toContain("SUPERSECRETKEY");
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
