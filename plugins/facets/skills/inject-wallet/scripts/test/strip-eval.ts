// Test helper: type-strip a browser-injected script and evaluate it as a classic
// script with provided globals — exactly the bytes that reach the page. Used to
// test provider.ts / connect-appkit.ts (which have no exports) without a
// bundler or a real browser.

import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function strip(relPath: string): string {
	return stripTypeScriptTypes(readFileSync(join(here, "..", relPath), "utf8"), { mode: "strip" });
}

/** Run provider.ts under Node (no window) and return its CJS exports. */
export function loadProvider(): Record<string, unknown> {
	const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
	new Function("module", strip("provider.ts"))(moduleObj);
	return moduleObj.exports;
}

type ProviderLike = {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
	on: (event: string, handler: (payload?: unknown) => void) => unknown;
};

/** Typed view of provider.ts's exports for the tests. */
export type ProviderApi = {
	createEip1193Provider: (
		cfg: { address?: string; chainId: number | string; rpcUrl: string },
		env: { fetchFn: unknown },
	) => { provider: ProviderLike };
	normalizeChainId: (value: unknown) => number | undefined;
	isMethodNotFound: (err: unknown) => boolean;
	toHex: (n: number) => string;
};

/**
 * Load provider.ts and return its exports typed. The boundary validates
 * each export is callable, then wraps it in a typed arrow — a `Function` value
 * is callable (returns `any`), so the wrappers type-check with no `as` cast.
 */
export function loadProviderApi(): ProviderApi {
	const loaded = loadProvider();
	const fn = (name: string) => {
		const value = loaded[name];
		if (typeof value !== "function") throw new Error(`${name} not exported by inject-wallet`);
		return value;
	};
	const create = fn("createEip1193Provider");
	const normalize = fn("normalizeChainId");
	const methodNotFound = fn("isMethodNotFound");
	const hex = fn("toHex");
	return {
		createEip1193Provider: (cfg, env) => create(cfg, env),
		normalizeChainId: (value) => normalize(value),
		isMethodNotFound: (err) => methodNotFound(err),
		toHex: (n) => hex(n),
	};
}

/** Run connect-appkit.ts with fake window/document. */
export function loadConnectAppkit(
	win: Record<string, unknown>,
	doc: Record<string, unknown>,
): void {
	new Function("window", "document", strip("connect-appkit.ts"))(win, doc);
}

/** Run provider.ts's browser-wiring branch with a fake window + CustomEvent. */
export function runProviderInBrowser(win: Record<string, unknown>, customEvent: unknown): void {
	new Function("module", "window", "CustomEvent", strip("provider.ts"))(
		{ exports: {} },
		win,
		customEvent,
	);
}
