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
	opts.log(`anvil ${args.join(" ")}`);

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
	const capture = (chunk: Buffer) => {
		for (const line of chunk.toString().split("\n")) if (line.trim()) tail.push(line);
		while (tail.length > 30) tail.shift();
	};
	child.stdout?.on("data", capture);
	child.stderr?.on("data", capture);
	child.on("error", (err) => opts.log(`anvil spawn error: ${String(err)}`));

	const stop = () => {
		if (!child.killed) child.kill("SIGTERM");
	};

	// Poll for readiness. Fork mode can be slow on the first block fetch.
	const deadline = Date.now() + (opts.timeoutMs ?? 20_000);
	const pollMs = opts.pollMs ?? 250;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`anvil exited early (code ${child.exitCode}):\n${tail.join("\n")}`);
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
	throw new Error(
		`anvil did not become ready in ${opts.timeoutMs ?? 20_000}ms:\n${tail.join("\n")}`,
	);
}
