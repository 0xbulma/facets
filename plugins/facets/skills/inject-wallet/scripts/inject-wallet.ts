#!/usr/bin/env node
/**
 * inject-wallet.ts — entry point. Boots a chain backend (Anvil fork or an
 * existing RPC) and the project dev server, injects a test wallet so Reown
 * AppKit can connect without an extension, then navigates + screenshots each
 * route. Run with Node's native TypeScript support (Node >= 22.18):
 *
 *   node inject-wallet.ts --anvil --fork-url <rpc> --url /dashboard
 *   node inject-wallet.ts --rpc https://mainnet.example --url / --url /app
 *
 * The injected provider is dependency-free and signs nothing in-browser; reads
 * and sends are proxied to the backend. See SKILL.md for the full flow and the
 * mock-connector fallback.
 */

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startAnvil } from "./lib/anvil.ts";
import { parseArgs, USAGE, UsageError } from "./lib/args.ts";
import { driveAndScreenshot, hasAgentBrowser } from "./lib/browser.ts";
import { resolveDevCommand, startDevServer } from "./lib/dev-server.ts";
import { jsonRpc } from "./lib/json-rpc.ts";
import {
	type Backend,
	DEV_ACCOUNT_0,
	type RouteResult,
	type RunOptions,
	type WalletConfig,
} from "./lib/types.ts";

const log = (s: string) => process.stderr.write(`[inject-wallet] ${s}\n`);

export async function queryChainId(rpcUrl: string): Promise<number> {
	const result = await jsonRpc(rpcUrl, { method: "eth_chainId" });
	if (typeof result !== "string") throw new Error(`could not read chainId from ${rpcUrl}`);
	return Number.parseInt(result, 16);
}

/** Render the human report + the machine-readable RESULT_JSON line. Pure. */
export function formatReport(opts: {
	mode: string;
	backend: string;
	appUrl: string;
	command: string;
	results: RouteResult[];
}): string {
	const lines = [
		"",
		"=== inject-wallet result ===",
		`mode: ${opts.mode}   backend: ${opts.backend}`,
		`app:  ${opts.appUrl}   (${opts.command})`,
		"routes:",
		...opts.results.map((r) => {
			if (r.error) return `  ${r.route} -> error=${r.error}`;
			const shot = r.screenshot ? `  shot=${r.screenshot}` : "";
			return `  ${r.route} -> connected=${r.connected}${shot}`;
		}),
	];
	const summary = {
		mode: opts.mode,
		backend: opts.backend,
		appUrl: opts.appUrl,
		routes: opts.results,
	};
	return `${lines.join("\n")}\nRESULT_JSON=${JSON.stringify(summary)}\n`;
}

/** Human label for the chain backend in the report header. */
export function backendLabel(backend: Backend, chainId: number): string {
	return backend.kind === "anvil"
		? `anvil(${chainId})${backend.forkUrl ? " fork" : ""}`
		: `rpc(${chainId})`;
}

/**
 * Exit code policy: 0 = ok, 2 = something to look at. A route is "ok" when it
 * has no error AND (mock mode, where connection is app-handled) OR it connected
 * OR a screenshot was produced.
 */
export function computeExitCode(results: RouteResult[], mode: string): number {
	const ok = results.every(
		(r) => !r.error && (mode === "mock" || r.connected || Boolean(r.screenshot)),
	);
	return ok ? 0 : 2;
}

async function main(): Promise<number> {
	let options: RunOptions;
	try {
		options = parseArgs(process.argv.slice(2));
	} catch (err) {
		if (err instanceof UsageError) {
			if (err.message) process.stderr.write(`error: ${err.message}\n\n`);
			process.stdout.write(USAGE);
			return err.message ? 1 : 0;
		}
		throw err;
	}

	// agent-browser drives the browser in BOTH modes (mock mode only skips the
	// provider injection, not the navigate/screenshot calls), so the preflight is
	// mode-independent.
	if (!options.dryRun && !hasAgentBrowser()) {
		process.stderr.write(
			"error: agent-browser not found on PATH (required to drive the browser, in inject and mock modes).\n  install: npm i -g agent-browser && agent-browser install\n  or pass --dry-run to print the plan without running.\n",
		);
		return 1;
	}

	const cwd = process.cwd();
	const outDir = resolve(cwd, options.outDir);
	if (!options.dryRun) mkdirSync(outDir, { recursive: true });
	const workDir = mkdtempSync(join(tmpdir(), "inject-wallet-"));
	const scriptDir = import.meta.dirname;

	const cleanups: Array<() => void> = [];
	let toredown = false;
	const teardown = () => {
		if (toredown) return; // idempotent: a signal handler + the finally block both call this
		toredown = true;
		if (!options.teardown) {
			log("--no-teardown: leaving Anvil + dev server running");
			return;
		}
		for (const fn of [...cleanups].reverse()) {
			try {
				fn();
			} catch {
				/* ignore */
			}
		}
	};
	for (const sig of ["SIGINT", "SIGTERM"] as const) {
		process.on(sig, () => {
			teardown();
			process.exit(130);
		});
	}

	try {
		// 1. Resolve the chain backend.
		let rpcUrl: string;
		let chainId: number;
		let address = options.address;
		if (options.backend.kind === "anvil") {
			if (options.dryRun) {
				rpcUrl = `http://127.0.0.1:${options.backend.port}`;
				chainId = options.chainId ?? 31337;
			} else {
				const anvil = await startAnvil({
					port: options.backend.port,
					forkUrl: options.backend.forkUrl,
					chainId: options.chainId,
					log,
				});
				cleanups.push(anvil.stop);
				rpcUrl = anvil.rpcUrl;
				chainId = anvil.chainId;
				address = address ?? anvil.address ?? DEV_ACCOUNT_0;
			}
		} else {
			rpcUrl = options.backend.rpcUrl;
			chainId = options.chainId ?? (options.dryRun ? 1 : await queryChainId(rpcUrl));
		}
		address = address ?? DEV_ACCOUNT_0;
		const walletConfig: WalletConfig = { address, chainId, rpcUrl };

		// 2. Boot the dev server.
		let command: string;
		let port: number;
		try {
			({ command, port } = resolveDevCommand({
				cwd,
				override: options.devCmd,
				fallbackPort: options.appPort,
			}));
		} catch (err) {
			if (!options.dryRun) throw err;
			command = options.devCmd ?? "<detected dev command>";
			port = options.appPort;
		}
		let appUrl = `http://localhost:${port}`;
		if (!options.dryRun) {
			const dev = await startDevServer({ cwd, command, port, log });
			cleanups.push(dev.stop);
			appUrl = dev.url;
		}

		// 3. Drive the browser: inject the wallet, connect, screenshot each route.
		const results = await driveAndScreenshot({
			baseUrl: appUrl,
			routes: options.routes,
			walletConfig,
			outDir,
			workDir,
			providerTs: join(scriptDir, "provider.ts"),
			connectAppkitTs: join(scriptDir, "connect-appkit.ts"),
			mode: options.mode,
			log,
			dryRun: options.dryRun,
		});

		const backend = backendLabel(options.backend, chainId);
		process.stdout.write(formatReport({ mode: options.mode, backend, appUrl, command, results }));

		return computeExitCode(results, options.mode);
	} finally {
		teardown();
	}
}

// Run only when executed directly (`node inject-wallet.ts …`), not when this
// module is imported by a test for its exported helpers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	void main().then(
		(code) => process.exit(code),
		(err) => {
			process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
			process.exit(1);
		},
	);
}
