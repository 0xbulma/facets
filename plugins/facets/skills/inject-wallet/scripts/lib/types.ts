// Shared types + constants for the inject-wallet orchestrator.

/** Config seeded into the page as `window.e2eWalletConfig` before load. */
export type WalletConfig = {
	readonly address?: string;
	readonly chainId: number;
	readonly rpcUrl: string;
	/**
	 * Read-only impersonation: the provider reports `address` but holds no key for
	 * it, so reads proxy normally while write methods (sends / signs) are rejected
	 * up front instead of failing cryptically against the backend.
	 */
	readonly impersonated?: boolean;
};

/** Where the test wallet's reads/sends are served from. */
export type Backend =
	| { readonly kind: "anvil"; readonly port: number; readonly forkUrl?: string }
	| { readonly kind: "rpc"; readonly rpcUrl: string };

export type Mode = "inject" | "mock";

export type RunOptions = {
	readonly routes: readonly string[];
	readonly appPort: number;
	readonly devCmd?: string;
	readonly chainId?: number;
	readonly address?: string;
	/** Read-only "view as" address: implies the connected address + sets WalletConfig.impersonated. */
	readonly impersonate?: string;
	readonly outDir: string;
	readonly backend: Backend;
	readonly mode: Mode;
	readonly teardown: boolean;
	readonly dryRun: boolean;
};

/** Per-route outcome reported back to the agent. */
export type RouteResult = {
	readonly route: string;
	readonly url: string;
	readonly navigated: boolean;
	readonly connected: boolean;
	readonly screenshot?: string;
	readonly consoleErrors: readonly string[];
	readonly error?: string;
};

/**
 * Anvil / Hardhat's first deterministic dev account. The address is safe to
 * embed (it is universally known and holds nothing on mainnet); it is used as
 * the default "connected" address in read-only mode. The matching private key
 * is intentionally NOT hardcoded — for the mock-connector path, copy it from
 * `anvil`'s startup banner. See references/mock-connector.md.
 */
export const DEV_ACCOUNT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export const DEFAULT_ANVIL_PORT = 8545;
export const DEFAULT_APP_PORT = 3000;
export const DEFAULT_ANVIL_CHAIN_ID = 31337;
