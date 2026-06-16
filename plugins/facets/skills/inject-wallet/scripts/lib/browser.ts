// Thin wrapper around the `agent-browser` CLI. The exact subcommand surface can
// drift across agent-browser versions — the verbs used here (open, navigate,
// eval, screenshot, close) are the stable core. If a call fails, confirm syntax
// with `agent-browser skills get core --full` and adjust AB below; the SKILL.md
// instructs the agent to take over the connect step on failure.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { isRecord } from "./json-rpc.ts";
import type { RouteResult, WalletConfig } from "./types.ts";

const AB = "agent-browser";

function errText(err: unknown): string {
	if (isRecord(err)) {
		const parts = [err.stderr, err.stdout, err.message].filter((p) => typeof p === "string");
		if (parts.length) return parts.join(" ").trim();
	}
	return err instanceof Error ? err.message : String(err);
}

export function hasAgentBrowser(): boolean {
	return spawnSync("command", ["-v", AB], { shell: true }).status === 0;
}

/** Type-strip a .ts file to `outPath` so it can be injected as a classic script. */
export function stripToJs(tsPath: string, outPath: string): string {
	writeFileSync(
		outPath,
		stripTypeScriptTypes(readFileSync(tsPath, "utf8"), { mode: "strip" }),
		"utf8",
	);
	return outPath;
}

function ab(
	args: string[],
	opts: { input?: string; log: (s: string) => void; dryRun: boolean },
): string {
	opts.log(`${AB} ${args.join(" ")}`);
	if (opts.dryRun) return "";
	try {
		return execFileSync(AB, args, {
			input: opts.input,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch (err) {
		throw new Error(`${AB} ${args[0]} failed: ${errText(err)}`);
	}
}

export type DriveOptions = {
	baseUrl: string;
	routes: readonly string[];
	walletConfig: WalletConfig;
	outDir: string;
	workDir: string;
	providerTs: string;
	connectAppkitTs: string;
	mode: "inject" | "mock";
	log: (s: string) => void;
	dryRun: boolean;
};

// Mutable working shape; returned as the readonly RouteResult to callers.
type RouteBuild = {
	route: string;
	url: string;
	navigated: boolean;
	connected: boolean;
	screenshot?: string;
	consoleErrors: string[];
	error?: string;
};

export function parseConnectStatus(raw: string): { connected: boolean; error?: string } {
	try {
		const status: unknown = JSON.parse(raw.trim() || "{}");
		if (isRecord(status)) {
			return {
				connected: status.connected === true,
				error: typeof status.error === "string" ? status.error : undefined,
			};
		}
	} catch {
		/* eval returned non-JSON (older AB or wrapped output) */
	}
	return { connected: false };
}

export async function driveAndScreenshot(opts: DriveOptions): Promise<RouteResult[]> {
	const results: RouteBuild[] = [];

	// For inject mode, register the wallet-config + provider as init-scripts so
	// they run before the dApp boots. Mock mode opens the app untouched (its own
	// env-gated mock connector handles the wallet).
	const initFlags: string[] = [];
	if (opts.mode === "inject") {
		const configPath = join(opts.workDir, "wallet-config.js");
		writeFileSync(
			configPath,
			`window.e2eWalletConfig = ${JSON.stringify(opts.walletConfig)};\n`,
			"utf8",
		);
		const providerPath = stripToJs(opts.providerTs, join(opts.workDir, "provider.js"));
		initFlags.push("--init-script", configPath, "--init-script", providerPath);
	}

	// `open` allocates the browser session; everything after runs inside a
	// try/finally so `close` always tears it down — even if the connect-script
	// read or an unexpected error throws before the loop completes.
	ab(["open", ...initFlags], { log: opts.log, dryRun: opts.dryRun });
	try {
		const connectJs =
			opts.mode === "inject"
				? stripTypeScriptTypes(readFileSync(opts.connectAppkitTs, "utf8"), { mode: "strip" })
				: "";

		for (const route of opts.routes) {
			const url = opts.baseUrl.replace(/\/$/, "") + (route.startsWith("/") ? route : `/${route}`);
			const safe = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "root";
			const shot = join(opts.outDir, `${safe}.png`);
			const result: RouteBuild = {
				route,
				url,
				navigated: false,
				connected: false,
				consoleErrors: [],
				screenshot: undefined,
			};
			try {
				ab(["navigate", url], { log: opts.log, dryRun: opts.dryRun });
				result.navigated = true;

				if (opts.mode === "inject") {
					const status = parseConnectStatus(
						ab(["eval", "--stdin"], { input: connectJs, log: opts.log, dryRun: opts.dryRun }),
					);
					result.connected = status.connected;
					if (status.error) result.consoleErrors.push(`connect: ${status.error}`);
				}

				ab(["screenshot", shot, "--full"], { log: opts.log, dryRun: opts.dryRun });
				result.screenshot = shot;
			} catch (err) {
				result.error = errText(err);
			}
			results.push(result);
		}
	} finally {
		try {
			ab(["close"], { log: opts.log, dryRun: opts.dryRun });
		} catch {
			/* best-effort teardown */
		}
	}
	return results;
}
