/**
 * connect-appkit.ts — best-effort, in-page connect driver for Reown AppKit.
 *
 * Type-stripped to plain JS and run via `agent-browser eval` AFTER the page has
 * loaded with provider.ts active. It pierces open Shadow DOM (AppKit is
 * built from Lit web components) to (1) click the "Connect" trigger and (2)
 * click our announced "E2E Wallet" entry, then waits for provider.ts to
 * flip `window.e2eConnected`.
 *
 * This DOM-walking path is inherently fragile across AppKit versions — it is the
 * convenience path. The robust alternative is agent-browser's own accessibility
 * snapshot + `@eN` click (the SKILL.md drives this when connect returns
 * connected:false), or the env-gated mock connector (references/mock-connector.md).
 *
 * The trailing expression resolves to a JSON status string that
 * `agent-browser eval` returns. The `export type` is a typechecker-only module
 * marker, erased by type-stripping, so the injected output is a valid classic
 * script with no top-level import/export.
 */

export type ScriptModuleMarker = never;

type El = {
	readonly tagName?: string;
	readonly textContent?: string | null;
	readonly shadowRoot?: QueryRoot | null;
	click?: () => void;
	getBoundingClientRect?: () => { width: number; height: number };
};
type QueryRoot = { querySelectorAll: (sel: string) => ArrayLike<El> };
type ConnectResult = {
	connected: boolean;
	address: string | null;
	clickedConnect: boolean;
	clickedWallet: boolean;
	step: string;
	error?: string;
};

declare const document: QueryRoot;
declare const window: {
	ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
	e2eConnected?: boolean;
	e2eConnect?: (opts?: { walletName?: string }) => Promise<ConnectResult>;
};

const WALLET_NAME = "E2E Wallet";
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const text = (el: El): string => (el.textContent ?? "").trim();

function toStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** All elements under `root`, descending into open shadow roots. */
function collectAll(root: QueryRoot): El[] {
	const out: El[] = [];
	const walk = (r: QueryRoot) => {
		for (const el of Array.from(r.querySelectorAll("*"))) {
			out.push(el);
			if (el.shadowRoot) walk(el.shadowRoot);
		}
	};
	walk(root);
	return out;
}

function isVisible(el: El): boolean {
	const rect = el.getBoundingClientRect?.();
	return !rect || (rect.width > 0 && rect.height > 0);
}

function isClickable(el: El): boolean {
	const tag = (el.tagName ?? "").toLowerCase();
	return tag.includes("button") || tag === "a" || /appkit|w3m|wallet/.test(tag);
}

function findClickable(match: (el: El) => boolean): El | undefined {
	return collectAll(document).find(
		(el) => match(el) && isVisible(el) && typeof el.click === "function",
	);
}

async function waitFor(fn: () => El | undefined, timeoutMs: number): Promise<El | undefined> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = fn();
		if (value) return value;
		await sleep(150);
	}
	return undefined;
}

/** Poll a boolean predicate until true or the timeout elapses. */
async function waitUntil(fn: () => boolean, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (fn()) return;
		await sleep(150);
	}
}

async function connect(opts?: { walletName?: string }): Promise<ConnectResult> {
	const walletName = opts?.walletName ?? WALLET_NAME;
	const result: ConnectResult = {
		connected: false,
		address: null,
		clickedConnect: false,
		clickedWallet: false,
		step: "start",
	};
	try {
		if (window.e2eConnected) {
			result.connected = true;
			result.step = "already-connected";
		} else {
			result.step = "find-connect";
			const trigger = findClickable((el) =>
				/connect|^appkit-button$|^w3m-button$/i.test(`${el.tagName ?? ""} ${text(el)}`),
			);
			if (!trigger) throw new Error("no Connect trigger found");
			trigger.click?.();
			result.clickedConnect = true;

			result.step = "await-modal";
			const entry = await waitFor(
				() =>
					findClickable(
						(el) => isClickable(el) && text(el).toLowerCase().includes(walletName.toLowerCase()),
					),
				6000,
			);
			if (!entry) throw new Error(`wallet entry "${walletName}" not found in modal`);
			entry.click?.();
			result.clickedWallet = true;

			result.step = "await-connected";
			await waitUntil(() => Boolean(window.e2eConnected), 8000);
			result.connected = Boolean(window.e2eConnected);
		}

		if (window.ethereum) {
			const accounts = toStringArray(
				await window.ethereum.request({ method: "eth_accounts" }).catch(() => []),
			);
			result.address = accounts[0] ?? null;
			if (result.address) result.connected = true;
		}
		result.step = result.connected ? "connected" : "not-connected";
	} catch (err) {
		result.error = err instanceof Error ? err.message : String(err);
	}
	return result;
}

window.e2eConnect = connect;

// biome-ignore lint/nursery/noFloatingPromises: agent-browser `eval` consumes this promise as its completion value.
connect().then((result) => JSON.stringify(result));
