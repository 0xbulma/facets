// Anvil lifecycle: spawn a local node (optionally forking a real RPC), wait for
// it to answer JSON-RPC, and expose its chain id + first unlocked account.
// The spawner is injectable so the readiness logic is unit-testable.

import { spawn } from "node:child_process";
import { adaptChild, type ChildLike } from "./child.ts";
import { jsonRpc, toStringArray } from "./json-rpc.ts";

export type AnvilHandle = {
	readonly rpcUrl: string;
	readonly chainId: number;
	readonly address: string | undefined;
	stop: () => void;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Build the `anvil` argv from options. Exposed for unit testing. */
export function buildAnvilArgs(opts: {
	port: number;
	chainId?: number;
	forkUrl?: string;
}): string[] {
	const args = ["--port", String(opts.port)];
	if (opts.chainId) args.push("--chain-id", String(opts.chainId));
	if (opts.forkUrl) args.push("--fork-url", opts.forkUrl);
	return args;
}

/**
 * Build a scrubber that removes a credential-bearing fork URL from any text.
 * One mechanism covers both the logged argv and anvil's own output, so there is
 * a single place to update when another secret-bearing flag is added.
 * Case-insensitive: the url crate may normalize scheme/host before echoing.
 */
export function makeRedactor(forkUrl?: string): (text: string) => string {
	if (!forkUrl) return (text) => text;
	const pattern = new RegExp(forkUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
	return (text) => text.replace(pattern, "<redacted>");
}

export type StartAnvilOptions = {
	port: number;
	forkUrl?: string;
	chainId?: number;
	log: (line: string) => void;
	/** Injectable for tests; defaults to spawning the real `anvil` binary. */
	spawnAnvil?: (args: string[]) => ChildLike;
	timeoutMs?: number;
	pollMs?: number;
};

export async function startAnvil(opts: StartAnvilOptions): Promise<AnvilHandle> {
	const rpcUrl = `http://127.0.0.1:${opts.port}`;
	const args = buildAnvilArgs(opts);
	const redact = makeRedactor(opts.forkUrl);
	opts.log(redact(`anvil ${args.join(" ")}`));

	const spawnAnvil =
		opts.spawnAnvil ??
		((a) => adaptChild(spawn("anvil", a, { stdio: ["ignore", "pipe", "pipe"] })));
	let child: ChildLike;
	try {
		child = spawnAnvil(args);
	} catch {
		throw new Error("anvil not found on PATH — install Foundry: https://getfoundry.sh");
	}
	const tail: string[] = [];
	// Redact at the capture seam, not at each throw site: anvil echoes the fork
	// endpoint in its startup banner and in reqwest errors, and `tail` is
	// interpolated into both failure messages below (which reach stderr).
	// `data` chunks are not line-aligned, so hold the trailing partial line back
	// until its rest arrives — otherwise a URL split across chunks matches neither
	// half and lands in `tail` verbatim. Each stream gets its OWN carry: stdout
	// (banner) and stderr (fatal errors) interleave, and one shared buffer would
	// splice a partial line from one onto the next chunk of the other.
	const makeCapture = () => {
		let carry = "";
		return {
			onData: (chunk: Buffer) => {
				const parts = (carry + chunk.toString()).split("\n");
				carry = parts.pop() ?? "";
				// Bound the partial-line buffer too: output with no newline (a long
				// single-line upstream error) would otherwise grow it without limit.
				if (carry.length > 8192) {
					parts.push(carry);
					carry = "";
				}
				for (const line of parts) if (line.trim()) tail.push(redact(line));
				while (tail.length > 30) tail.shift();
			},
			rest: () => carry,
		};
	};
	const out = makeCapture();
	const err = makeCapture();
	child.stdout?.on("data", out.onData);
	child.stderr?.on("data", err.onData);
	child.on("error", (e) => opts.log(redact(`anvil spawn error: ${String(e)}`)));

	// A process that dies mid-line leaves its last line in a carry; fold both in so
	// the failure messages below don't drop the most recent (often the fatal) line.
	// Only the carries need scrubbing here — `tail` entries were redacted on entry.
	const tailText = () =>
		[...tail, redact(out.rest()), redact(err.rest())].filter((l) => l.trim()).join("\n");

	const stop = () => {
		if (!child.killed) child.kill("SIGTERM");
	};

	// Poll for readiness. Fork mode can be slow on the first block fetch.
	const deadline = Date.now() + (opts.timeoutMs ?? 20_000);
	const pollMs = opts.pollMs ?? 250;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`anvil exited early (code ${child.exitCode}):\n${tailText()}`);
		}
		try {
			const chainHex = await jsonRpc(rpcUrl, { method: "eth_chainId" });
			const chainId = typeof chainHex === "string" ? Number.parseInt(chainHex, 16) : Number.NaN;
			if (Number.isNaN(chainId)) throw new Error("bad chainId");
			const accounts = toStringArray(
				await jsonRpc(rpcUrl, { method: "eth_accounts" }).catch(() => []),
			);
			return { rpcUrl, chainId, address: accounts[0], stop };
		} catch {
			await sleep(pollMs);
		}
	}
	stop();
	throw new Error(`anvil did not become ready in ${opts.timeoutMs ?? 20_000}ms:\n${tailText()}`);
}
