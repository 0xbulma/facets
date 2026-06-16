// CLI argument parsing for inject-wallet.ts. Zero-dependency; uses only the
// shape the SKILL.md documents. Throws a typed error on misuse so the entry
// point can print usage and exit non-zero.

import {
	type Backend,
	DEFAULT_ANVIL_PORT,
	DEFAULT_APP_PORT,
	type Mode,
	type RunOptions,
} from "./types.ts";

export class UsageError extends Error {}

export const USAGE = `inject-wallet — connect a test wallet, then screenshot a Reown AppKit dApp.

Usage:
  node inject-wallet.ts [options]

Backend (choose one; defaults to --anvil):
  --anvil                 boot a local Anvil node (default backend)
  --fork-url <url>        with --anvil: fork this RPC for realistic state
  --anvil-port <n>        Anvil port (default ${DEFAULT_ANVIL_PORT})
  --rpc <url>             read-only: point the wallet at an existing RPC

Wallet / app:
  --url <path>            route to open (repeatable); default "/"
  --routes "/a,/b"        comma-separated routes (alternative to --url)
  --port <n>              dev-server port (default ${DEFAULT_APP_PORT})
  --dev-cmd "<cmd>"       override dev-server command (else detected)
  --chain-id <n>          chain id to report (anvil default 31337; rpc: queried)
  --address <0x..>        connected address (default: derived / Anvil account 0)
  --mode inject|mock      inject the provider (default) or expect an app-side
                          mock connector (env-gated). See references/mock-connector.md
  --out <dir>             screenshot dir (default .context/inject-wallet)
  --no-teardown           leave Anvil + dev server running after the run
  --dry-run               print the plan and resolved commands, run nothing
  -h, --help              show this help
`;

export function parseArgs(argv: readonly string[]): RunOptions {
	const args = [...argv];
	let i = 0;
	const valueAt = (flag: string): string => {
		const value = args[i + 1];
		if (value === undefined || value.startsWith("--"))
			throw new UsageError(`${flag} requires a value`);
		i += 1;
		return value;
	};
	const numberAt = (flag: string): number => {
		const value = valueAt(flag);
		const parsed = Number(value);
		if (Number.isNaN(parsed)) throw new UsageError(`${flag} must be a number, got "${value}"`);
		return parsed;
	};

	const routes: string[] = [];
	let appPort = DEFAULT_APP_PORT;
	let devCmd: string | undefined;
	let chainId: number | undefined;
	let address: string | undefined;
	let outDir = ".context/inject-wallet";
	let mode: Mode = "inject";
	let teardown = true;
	let dryRun = false;

	let useAnvil = false;
	let forkUrl: string | undefined;
	let anvilPort = DEFAULT_ANVIL_PORT;
	let rpcUrl: string | undefined;

	for (; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "-h":
			case "--help":
				throw new UsageError("");
			case "--anvil":
				useAnvil = true;
				break;
			case "--fork-url":
				useAnvil = true;
				forkUrl = valueAt(arg);
				break;
			case "--anvil-port":
				useAnvil = true;
				anvilPort = numberAt(arg);
				break;
			case "--rpc":
				rpcUrl = valueAt(arg);
				break;
			case "--url":
				routes.push(valueAt(arg));
				break;
			case "--routes":
				for (const route of valueAt(arg).split(",")) if (route.trim()) routes.push(route.trim());
				break;
			case "--port":
				appPort = numberAt(arg);
				break;
			case "--dev-cmd":
				devCmd = valueAt(arg);
				break;
			case "--chain-id":
				chainId = numberAt(arg);
				break;
			case "--address":
				address = valueAt(arg);
				break;
			case "--mode": {
				const value = valueAt(arg);
				if (value !== "inject" && value !== "mock")
					throw new UsageError(`--mode must be inject|mock, got "${value}"`);
				mode = value;
				break;
			}
			case "--out":
				outDir = valueAt(arg);
				break;
			case "--no-teardown":
				teardown = false;
				break;
			case "--dry-run":
				dryRun = true;
				break;
			default:
				throw new UsageError(`unknown argument: ${arg}`);
		}
	}

	if (rpcUrl && useAnvil) throw new UsageError("--rpc and --anvil are mutually exclusive");
	const backend: Backend = rpcUrl
		? { kind: "rpc", rpcUrl }
		: { kind: "anvil", port: anvilPort, forkUrl };

	return {
		routes: routes.length ? routes : ["/"],
		appPort,
		devCmd,
		chainId,
		address,
		outDir,
		backend,
		mode,
		teardown,
		dryRun,
	};
}
