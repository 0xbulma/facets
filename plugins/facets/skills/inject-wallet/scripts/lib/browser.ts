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

// --- agent-browser readiness preflight -------------------------------------
// `command -v agent-browser` proves only that *something* is on PATH; it passes
// for a dangling binary and for an install that never ran `agent-browser
// install` (the browser binaries). Probe functionally instead — `--version`
// then `doctor` — and distinguish the failure modes so the caller can print the
// right remediation and fail *before* booting Anvil + the dev server.

export type AgentBrowserStatus =
	| { kind: "ready"; version: string }
	| { kind: "missing" } // not on PATH (spawn ENOENT)
	| { kind: "broken"; detail: string } // on PATH but `--version` non-zero / unparseable
	| { kind: "no-browser"; detail: string }; // CLI ok, `doctor` reports the browser unready

export type AbProbe = {
	status: number | null;
	stdout: string;
	stderr: string;
	errCode?: string;
};

/** The single I/O seam for the probe — injected so every branch is testable. */
export type AbRunner = (args: readonly string[]) => AbProbe;

function errnoCode(error: Error | undefined): string | undefined {
	if (error && "code" in error && typeof error.code === "string") return error.code;
	return undefined;
}

const defaultRunner: AbRunner = (args) => {
	const r = spawnSync(AB, [...args], { encoding: "utf8" });
	return {
		status: r.status,
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? "",
		errCode: errnoCode(r.error),
	};
};

export function parseAgentBrowserVersion(stdout: string): string | null {
	return stdout.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
}

function probeDetail(r: AbProbe): string {
	const text = (r.stderr || r.stdout).trim();
	if (text) return text;
	if (r.errCode) return `spawn error: ${r.errCode}`;
	return r.status === null ? "no output" : `exited with status ${r.status}`;
}

/** Keep the actionable `fail`/`warn`/`Summary` lines from `doctor` output. */
export function summarizeDoctor(output: string): string {
	const lines = output.split("\n").map((l) => l.trim());
	const picked = lines.filter((l) => /^(fail|warn)\b/i.test(l) || /^Summary:/i.test(l));
	return picked.length ? picked.join("\n") : output.trim();
}

export function probeAgentBrowser(run: AbRunner = defaultRunner): AgentBrowserStatus {
	const ver = run(["--version"]);
	if (ver.errCode === "ENOENT") return { kind: "missing" };
	const version = parseAgentBrowserVersion(ver.stdout);
	if (ver.status !== 0 || !version) return { kind: "broken", detail: probeDetail(ver) };

	const doc = run(["doctor"]);
	if (doc.status !== 0) {
		const detail = summarizeDoctor(`${doc.stdout}\n${doc.stderr}`) || probeDetail(doc);
		return { kind: "no-browser", detail };
	}
	return { kind: "ready", version };
}

const AB_INSTALL = "npm i -g agent-browser && agent-browser install";
const DRY_HINT = "  or pass --dry-run to print the plan without running.";

function indent(text: string): string {
	return text
		.split("\n")
		.map((l) => `    ${l}`)
		.join("\n");
}

/** Pure: turn a status into the hard-fail message, or null when ready. */
export function agentBrowserError(status: AgentBrowserStatus): string | null {
	switch (status.kind) {
		case "ready":
			return null;
		case "missing":
			return [
				"error: agent-browser not found on PATH (required to drive the browser, in inject and mock modes).",
				`  install: ${AB_INSTALL}`,
				DRY_HINT,
				"",
			].join("\n");
		case "no-browser":
			return [
				"error: agent-browser is on PATH but its browser is not ready (the `agent-browser install` step).",
				indent(status.detail),
				"  fix: agent-browser install   (or repair: agent-browser doctor --fix)",
				DRY_HINT,
				"",
			].join("\n");
		case "broken":
			return [
				"error: agent-browser is on PATH but did not run (broken or incompatible install).",
				indent(status.detail),
				`  fix: reinstall — ${AB_INSTALL}   then verify: agent-browser doctor`,
				DRY_HINT,
				"",
			].join("\n");
	}
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
