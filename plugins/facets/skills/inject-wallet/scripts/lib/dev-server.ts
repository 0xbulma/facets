// Dev-server lifecycle: detect the project's dev command, boot it with the E2E
// env flag set, wait until it answers HTTP, and expose a stop handle.
// Mirrors the readiness-poll pattern in pr-review-engine's runtime-validation
// persona. Zero runtime dependency: child_process + fs + global fetch.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { adaptChild, type ChildLike } from "./child.ts";

export type DevServerHandle = {
	readonly url: string;
	readonly command: string;
	stop: () => void;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function detectPackageManager(cwd: string): string {
	if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
	if (existsSync(join(cwd, "bun.lockb"))) return "bun";
	return "npm";
}

function runnerFor(pm: string): string {
	if (pm === "npm") return "npm run";
	if (pm === "yarn") return "yarn";
	return `${pm} run`;
}

/** Pick a dev script: prefer `dev`, then `start`, then the first dev/serve/start-prefixed one. */
export function detectScript(scripts: Record<string, string>): string | undefined {
	if (scripts.dev) return "dev";
	if (scripts.start) return "start";
	return Object.keys(scripts).find((name) => /^(dev|serve|start)/.test(name));
}

/** Honor an explicit -p/--port in the script body if present. */
export function portFromScript(body: string | undefined, fallback: number): number {
	const match = body?.match(/(?:-p|--port)[ =](\d+)/);
	return match?.[1] ? Number(match[1]) : fallback;
}

function readScripts(pkgRaw: string): Record<string, string> {
	const parsed: unknown = JSON.parse(pkgRaw);
	const out: Record<string, string> = {};
	if (typeof parsed === "object" && parsed !== null && "scripts" in parsed) {
		const scripts = parsed.scripts;
		if (typeof scripts === "object" && scripts !== null) {
			for (const [name, value] of Object.entries(scripts))
				if (typeof value === "string") out[name] = value;
		}
	}
	return out;
}

export function resolveDevCommand(opts: { cwd: string; override?: string; fallbackPort: number }): {
	command: string;
	port: number;
} {
	if (opts.override) return { command: opts.override, port: opts.fallbackPort };

	const pkgPath = join(opts.cwd, "package.json");
	if (!existsSync(pkgPath))
		throw new Error(`no package.json in ${opts.cwd} and no --dev-cmd given`);
	const scripts = readScripts(readFileSync(pkgPath, "utf8"));
	const script = detectScript(scripts);
	if (!script) throw new Error("no dev/start/serve script in package.json — pass --dev-cmd");

	const runner = runnerFor(detectPackageManager(opts.cwd));
	return {
		command: `${runner} ${script}`,
		port: portFromScript(scripts[script], opts.fallbackPort),
	};
}

/** Env the dev server is booted with; the E2E flags gate the mock connector. */
export const E2E_ENV = {
	NEXT_PUBLIC_E2E_WALLET: "1",
	VITE_E2E_WALLET: "1",
	PUBLIC_E2E_WALLET: "1",
	// BROWSER=none stops CRA/some toolchains from opening a real browser tab.
	BROWSER: "none",
} as const;

export type StartDevServerOptions = {
	cwd: string;
	command: string;
	port: number;
	log: (line: string) => void;
	/** Injectable for tests; defaults to spawning `command` in a shell. */
	spawnDev?: () => ChildLike;
	timeoutMs?: number;
	pollMs?: number;
};

export async function startDevServer(opts: StartDevServerOptions): Promise<DevServerHandle> {
	const url = `http://localhost:${opts.port}`;
	opts.log(`dev server: ${opts.command}  (waiting on ${url})`);

	const spawnDev =
		opts.spawnDev ??
		(() =>
			adaptChild(
				spawn(opts.command, {
					cwd: opts.cwd,
					shell: true,
					stdio: ["ignore", "pipe", "pipe"],
					env: { ...process.env, ...E2E_ENV },
				}),
			));
	const child = spawnDev();

	const tail: string[] = [];
	const capture = (chunk: Buffer) => {
		for (const line of chunk.toString().split("\n")) if (line.trim()) tail.push(line);
		while (tail.length > 30) tail.shift();
	};
	child.stdout?.on("data", capture);
	child.stderr?.on("data", capture);

	const stop = () => {
		if (!child.killed) child.kill("SIGTERM");
	};

	const timeoutMs = opts.timeoutMs ?? 60_000;
	const deadline = Date.now() + timeoutMs;
	const pollMs = opts.pollMs ?? 500;
	while (Date.now() < deadline) {
		if (child.exitCode !== null)
			throw new Error(`dev server exited early (code ${child.exitCode}):\n${tail.join("\n")}`);
		try {
			const res = await fetch(url, { redirect: "manual" });
			if (res.status < 500) return { url, command: opts.command, stop };
		} catch {
			/* not up yet */
		}
		await sleep(pollMs);
	}
	stop();
	throw new Error(`dev server did not become ready in ${timeoutMs}ms:\n${tail.join("\n")}`);
}
