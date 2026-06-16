/**
 * provider.ts — self-contained, zero-dependency EIP-1193 provider for
 * agent-driven dApp testing.
 *
 * Injected BEFORE page load (after type-stripping to plain JS) via
 * `agent-browser --init-script`, so Reown AppKit — and any wagmi / EIP-6963
 * dApp — discovers and connects a test wallet without a browser extension.
 * AppKit finds it two ways: legacy `window.ethereum` and an EIP-6963
 * `eip6963:announceProvider` event (Multi Injected Provider Discovery — the
 * standard AppKit uses to enumerate wallets).
 *
 * Signing strategy — no in-browser cryptography:
 *   Wallet-only methods (accounts, chainId, chain switching) are answered
 *   locally. EVERYTHING else — reads, `personal_sign`, `eth_sendTransaction` —
 *   is proxied to the configured JSON-RPC endpoint. When that endpoint is Anvil
 *   with the dev account unlocked, Anvil signs and sends for us. Older Anvil
 *   builds lack `personal_sign`, so we fall back to `eth_sign` (Anvil's
 *   `eth_sign` applies the EIP-191 personal-message prefix). SIWE-heavy apps
 *   should prefer the mock-connector path — see references/mock-connector.md.
 *
 * Config: read from `window.e2eWalletConfig = { address?, chainId, rpcUrl }`,
 * seeded by a separate init-script the orchestrator writes at run time. When
 * `address` is omitted the provider derives it from the node's `eth_accounts`
 * (works against Anvil's unlocked accounts).
 *
 * Dual-mode: in a browser it wires `window.ethereum` + EIP-6963; under Node it
 * exports the pure factory for unit testing. The `export type` below is a
 * module marker for the typechecker only — it is erased by type-stripping, so
 * the injected output is a valid classic script with no top-level import/export
 * (the `module.exports` branch is skipped in the browser, where there is no
 * `module` binding).
 */

export type ScriptModuleMarker = never;

type WalletConfig = {
	readonly address?: string;
	readonly chainId: number | string;
	readonly rpcUrl: string;
	/** Read-only "view as": report `address` but reject sends/signs (no key held). */
	readonly impersonated?: boolean;
};

// Methods that require the address's private key. Under read-only impersonation
// we hold no key, so these are rejected up front instead of proxied to the
// backend (where they would fail cryptically or hang the connect flow). This is
// a deny-list because reads are open-ended (the `default` case proxies any
// unlisted method); every key-requiring send/sign variant must appear here,
// including the EIP-5792 batched-send `wallet_sendCalls` modern AppKit emits.
const WRITE_METHODS = new Set([
	"eth_sendTransaction",
	"eth_signTransaction",
	"personal_sign",
	"eth_sign",
	"eth_signTypedData",
	"eth_signTypedData_v1",
	"eth_signTypedData_v2",
	"eth_signTypedData_v3",
	"eth_signTypedData_v4",
	"wallet_sendCalls",
]);

type JsonRpcResponse = { result?: unknown; error?: { code?: number; message?: string } };

type FetchLike = (
	url: string,
	init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ json: () => Promise<JsonRpcResponse> }>;

type Eip1193Request = { method: string; params?: unknown[] };

type Emitter = {
	on: (event: string, handler: (payload?: unknown) => void) => void;
	off: (event: string, handler: (payload?: unknown) => void) => void;
	emit: (event: string, payload?: unknown) => void;
};

type Eip1193Provider = {
	isMetaMask: boolean;
	isConnected: () => boolean;
	request: (args: Eip1193Request) => Promise<unknown>;
	enable: () => Promise<unknown>;
	send: (method: string | Eip1193Request, params?: unknown[]) => Promise<unknown>;
	sendAsync: (
		payload: Eip1193Request & { id?: number },
		cb: (err: unknown, res?: unknown) => void,
	) => void;
	on: (event: string, handler: (payload?: unknown) => void) => Eip1193Provider;
	removeListener: (event: string, handler: (payload?: unknown) => void) => Eip1193Provider;
};

function toHex(n: number): string {
	return `0x${Number(n).toString(16)}`;
}

function normalizeChainId(value: number | string | undefined): number | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "string")
		return value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
	return Number(value);
}

function isMethodNotFound(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const code = "code" in err ? err.code : undefined;
	const message = "message" in err ? String(err.message) : "";
	return code === -32601 || /method not found|not supported|does not exist/i.test(message);
}

function toStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function readChainIdParam(param: unknown): number | undefined {
	if (typeof param === "object" && param !== null && "chainId" in param) {
		const raw = param.chainId;
		if (typeof raw === "string" || typeof raw === "number") return normalizeChainId(raw);
	}
	return undefined;
}

function createEmitter(): Emitter {
	const listeners: Record<string, Array<(payload?: unknown) => void>> = Object.create(null);
	return {
		on(event, handler) {
			const existing = listeners[event];
			if (existing) existing.push(handler);
			else listeners[event] = [handler];
		},
		off(event, handler) {
			listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
		},
		emit(event, payload) {
			for (const h of (listeners[event] ?? []).slice()) {
				try {
					h(payload);
				} catch {
					/* a listener throwing must not break dispatch */
				}
			}
		},
	};
}

/**
 * Build an EIP-1193 provider. `env.fetchFn` is the JSON-RPC transport
 * (`window.fetch` in the browser, a stub in tests); `env.eventTarget` is an
 * optional pre-built emitter.
 */
function createEip1193Provider(
	cfg: WalletConfig,
	env: { fetchFn: FetchLike; eventTarget?: Emitter },
): {
	provider: Eip1193Provider;
	emitter: Emitter;
	getChainId: () => number;
	getAccount: () => string | null;
} {
	const fetchFn = env.fetchFn;
	const emitter = env.eventTarget ?? createEmitter();
	let chainId = normalizeChainId(cfg.chainId) ?? 1;
	let account: string | null = (cfg.address ?? "").toLowerCase() || null;
	const rpcUrl = cfg.rpcUrl;
	let rpcId = 0;

	async function rpc(method: string, params: unknown[]): Promise<unknown> {
		rpcId += 1;
		const res = await fetchFn(rpcUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
		});
		const json = await res.json();
		if (json?.error) {
			const error: Error & { code?: number } = new Error(json.error.message ?? "RPC error");
			error.code = json.error.code;
			throw error;
		}
		return json?.result;
	}

	async function resolveAccount(): Promise<string | null> {
		if (account) return account;
		const accounts = toStringArray(await rpc("eth_accounts", []));
		if (accounts[0]) account = accounts[0].toLowerCase();
		return account;
	}

	async function request(args: Eip1193Request): Promise<unknown> {
		const method = args?.method;
		const params = args?.params ?? [];
		if (cfg.impersonated && WRITE_METHODS.has(method)) {
			const target = account ?? (cfg.address ? cfg.address.toLowerCase() : "the connected address");
			const error: Error & { code?: number } = new Error(
				`[e2e-wallet] read-only impersonation: cannot ${method} for ${target} — no private key ` +
					"is held for this address. Impersonation is view-only; reads proxy to the backend. For " +
					"sends/signatures, use a key-holding Anvil account (drop --impersonate) or --mode mock.",
			);
			error.code = 4100; // EIP-1193 "Unauthorized"
			throw error;
		}
		switch (method) {
			case "eth_requestAccounts":
			case "eth_accounts": {
				const addr = await resolveAccount();
				return addr ? [addr] : [];
			}
			case "eth_chainId":
				return toHex(chainId);
			case "net_version":
				return String(chainId);
			case "wallet_switchEthereumChain": {
				// Cosmetic for a single-backend test wallet: this updates the reported
				// chain id and emits chainChanged, but does NOT repoint the RPC — reads
				// still hit the same Anvil/RPC backend.
				const next = readChainIdParam(params[0]);
				if (next && next !== chainId) {
					chainId = next;
					emitter.emit("chainChanged", toHex(chainId));
				}
				return null;
			}
			case "wallet_addEthereumChain":
			case "wallet_watchAsset":
			case "wallet_registerOnboarding":
				return null;
			case "wallet_requestPermissions":
			case "wallet_getPermissions":
				return [{ parentCapability: "eth_accounts" }];
			case "personal_sign": {
				// params: [dataHex, address]. Forward as-is; on older Anvil that lacks
				// personal_sign, retry as eth_sign with swapped [address, dataHex].
				try {
					return await rpc("personal_sign", params);
				} catch (err) {
					if (isMethodNotFound(err)) return await rpc("eth_sign", [params[1], params[0]]);
					throw err;
				}
			}
			default:
				// eth_call, eth_getBalance, eth_blockNumber, eth_estimateGas,
				// eth_sendTransaction, eth_signTypedData_v4, eth_getTransactionReceipt…
				return rpc(method, params);
		}
	}

	const provider: Eip1193Provider = {
		isMetaMask: true, // some dApps still gate injected UI on this flag
		isConnected: () => true,
		request,
		// Legacy methods route through `provider.request` (read at call time) so
		// they pick up the wireBrowser wrapper (e2eConnected + accountsChanged)
		// instead of bypassing it via the inner closure.
		enable: () => provider.request({ method: "eth_requestAccounts" }),
		send: (m, p) =>
			provider.request({
				method: typeof m === "string" ? m : m.method,
				params: p ?? (typeof m === "string" ? undefined : m.params),
			}),
		sendAsync: (payload, cb) =>
			provider.request(payload).then(
				(result) => cb(null, { id: payload.id, jsonrpc: "2.0", result }),
				(err) => cb(err),
			),
		on: (event, handler) => {
			emitter.on(event, handler);
			return provider;
		},
		removeListener: (event, handler) => {
			emitter.off(event, handler);
			return provider;
		},
	};

	return { provider, emitter, getChainId: () => chainId, getAccount: () => account };
}

// --- browser wiring (skipped under Node, where `window` is undefined) ---------

type DappWindow = {
	ethereum?: unknown;
	e2eWalletConfig?: WalletConfig;
	e2eConnected?: boolean;
	fetch: FetchLike;
	crypto?: { randomUUID?: () => string };
	dispatchEvent: (event: unknown) => boolean;
	addEventListener: (type: string, handler: () => void) => void;
};

declare const window: DappWindow | undefined;
declare const CustomEvent: new (type: string, init: { detail: unknown }) => unknown;
declare const module: { exports: Record<string, unknown> };

function wireBrowser(win: DappWindow): void {
	const cfg = win.e2eWalletConfig;
	if (!cfg?.rpcUrl) {
		console.warn("[e2e-wallet] window.e2eWalletConfig.rpcUrl missing — provider not injected");
		return;
	}
	const built = createEip1193Provider(cfg, { fetchFn: win.fetch.bind(win) });
	const provider = built.provider;

	// Flip a flag once the dApp asks us to connect, so connect-appkit.ts (and the
	// orchestrator) have a reliable, framework-agnostic "connected" signal, and
	// emit accountsChanged so wagmi/AppKit observe the now-available account.
	const innerRequest = provider.request.bind(provider);
	provider.request = async (args: Eip1193Request) => {
		const result = await innerRequest(args);
		if (args?.method === "eth_requestAccounts") {
			win.e2eConnected = true;
			built.emitter.emit("accountsChanged", Array.isArray(result) ? result : []);
		}
		return result;
	};

	Object.defineProperty(win, "ethereum", { value: provider, configurable: true, writable: true });

	const icon = `data:image/svg+xml,${encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
			'<rect width="32" height="32" rx="6" fill="#6366f1"/>' +
			'<text x="16" y="21" font-size="11" fill="#fff" text-anchor="middle" font-family="sans-serif">E2E</text></svg>',
	)}`;
	const info = {
		uuid: win.crypto?.randomUUID ? win.crypto.randomUUID() : "e2e-wallet-0000",
		name: "E2E Wallet",
		icon,
		rdns: "io.facets.e2ewallet",
	};
	const announce = () =>
		win.dispatchEvent(
			new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }),
		);
	win.addEventListener("eip6963:requestProvider", announce);
	announce();

	// Fire `connect` once the chain id resolves, so wagmi treats us as live.
	void provider
		.request({ method: "eth_chainId" })
		.then((cid) => built.emitter.emit("connect", { chainId: cid }));
}

if (typeof window !== "undefined") wireBrowser(window);
// biome-ignore lint/complexity/useOptionalChain: `module` is undeclared in the browser; the typeof guard is required (optional chaining would ReferenceError).
if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		createEip1193Provider,
		normalizeChainId,
		isMethodNotFound,
		toHex,
		toStringArray,
	};
}
