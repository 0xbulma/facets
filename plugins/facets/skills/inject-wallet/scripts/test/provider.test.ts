// Tests for the injected EIP-1193 provider. The provider file has no exports
// (it must stay a classic script for injection), so we strip + evaluate it and
// pull the CJS-exported factory. No DOM, no network — fetch is stubbed.

import { describe, expect, it } from "vitest";
import { loadProviderApi, runProviderInBrowser } from "./strip-eval.ts";

type RpcHandler = (method: string, params: unknown[]) => unknown;

const { createEip1193Provider, normalizeChainId, isMethodNotFound, toHex } = loadProviderApi();

const RPC = "http://127.0.0.1:8545";

function build(
	cfg: { address?: string; chainId: number | string; rpcUrl: string; impersonated?: boolean },
	handler: RpcHandler,
) {
	const calls: Array<{ method: string; params: unknown[] }> = [];
	const fetchFn = async (_url: string, opts: { body: string }) => {
		const body = JSON.parse(opts.body);
		calls.push(body);
		return { json: async () => handler(body.method, body.params) };
	};
	const built = createEip1193Provider(cfg, { fetchFn });
	return { provider: built.provider, calls };
}

const mustNotCall: RpcHandler = (method) => {
	throw new Error(`unexpected RPC call: ${method}`);
};

describe("inject-wallet provider", () => {
	it("answers eth_chainId / net_version locally", async () => {
		const { provider, calls } = build(
			{ address: "0xABC", chainId: 8453, rpcUrl: RPC },
			mustNotCall,
		);
		expect(await provider.request({ method: "eth_chainId" })).toBe("0x2105");
		expect(await provider.request({ method: "net_version" })).toBe("8453");
		expect(calls).toHaveLength(0);
	});

	it("returns the configured address lowercased", async () => {
		const { provider } = build(
			{ address: "0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266", chainId: 1, rpcUrl: RPC },
			mustNotCall,
		);
		expect(await provider.request({ method: "eth_requestAccounts" })).toEqual([
			"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
		]);
	});

	it("derives the address from eth_accounts when unset (Anvil mode)", async () => {
		const { provider, calls } = build({ chainId: 31337, rpcUrl: RPC }, (method) => {
			if (method === "eth_accounts")
				return { result: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"] };
			return mustNotCall(method, []);
		});
		expect(await provider.request({ method: "eth_accounts" })).toEqual([
			"0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
		]);
		expect(calls).toHaveLength(1);
	});

	it("proxies unknown methods verbatim to the RPC endpoint", async () => {
		const { provider, calls } = build({ address: "0xabc", chainId: 1, rpcUrl: RPC }, (method) => {
			if (method === "eth_getBalance") return { result: "0xde0b6b3a7640000" };
			return mustNotCall(method, []);
		});
		expect(await provider.request({ method: "eth_getBalance", params: ["0xabc", "latest"] })).toBe(
			"0xde0b6b3a7640000",
		);
		expect(calls[0]?.method).toBe("eth_getBalance");
		expect(calls[0]?.params).toEqual(["0xabc", "latest"]);
	});

	it("falls back personal_sign -> eth_sign (swapped params) on method-not-found", async () => {
		const { provider, calls } = build({ address: "0xabc", chainId: 1, rpcUrl: RPC }, (method) => {
			if (method === "personal_sign")
				return { error: { code: -32601, message: "Method not found" } };
			if (method === "eth_sign") return { result: "0xsignature" };
			return mustNotCall(method, []);
		});
		expect(
			await provider.request({ method: "personal_sign", params: ["0xdeadbeef", "0xabc"] }),
		).toBe("0xsignature");
		expect(calls[1]?.method).toBe("eth_sign");
		expect(calls[1]?.params).toEqual(["0xabc", "0xdeadbeef"]);
	});

	it("passes personal_sign through when the node supports it", async () => {
		const { provider, calls } = build({ address: "0xabc", chainId: 1, rpcUrl: RPC }, (method) => {
			if (method === "personal_sign") return { result: "0xnativesig" };
			return mustNotCall(method, []);
		});
		expect(await provider.request({ method: "personal_sign", params: ["0xdead", "0xabc"] })).toBe(
			"0xnativesig",
		);
		expect(calls).toHaveLength(1);
	});

	it("updates chainId and emits chainChanged on wallet_switchEthereumChain", async () => {
		const { provider } = build({ address: "0xabc", chainId: 1, rpcUrl: RPC }, mustNotCall);
		let emitted: unknown;
		provider.on("chainChanged", (cid: unknown) => {
			emitted = cid;
		});
		await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa" }] });
		expect(emitted).toBe("0xa");
		expect(await provider.request({ method: "eth_chainId" })).toBe("0xa");
	});

	it("rejects write methods under read-only impersonation, but still proxies reads", async () => {
		const { provider, calls } = build(
			{ address: "0xWhale", chainId: 1, rpcUrl: RPC, impersonated: true },
			(method) => {
				if (method === "eth_getBalance") return { result: "0xde0b6b3a7640000" };
				if (method === "eth_call") return { result: "0x" };
				return mustNotCall(method, []);
			},
		);

		// Every key-requiring method in the provider's deny-list must reject — keep
		// this list in sync with WRITE_METHODS so dropping an entry fails CI.
		for (const method of [
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
		]) {
			await expect(provider.request({ method, params: [] })).rejects.toMatchObject({
				code: 4100,
				message: expect.stringContaining("read-only impersonation"),
			});
		}
		// No write method reached the backend.
		expect(calls).toHaveLength(0);

		// Reads still flow through to the RPC.
		expect(
			await provider.request({ method: "eth_getBalance", params: ["0xWhale", "latest"] }),
		).toBe("0xde0b6b3a7640000");
		expect(await provider.request({ method: "eth_call", params: [{}] })).toBe("0x");
		expect(calls.map((c) => c.method)).toEqual(["eth_getBalance", "eth_call"]);
	});

	it("proxies write methods normally when NOT impersonating (guard is gated on the flag)", async () => {
		const { provider, calls } = build({ address: "0xabc", chainId: 1, rpcUrl: RPC }, (method) => {
			if (method === "eth_sendTransaction") return { result: "0xtxhash" };
			if (method === "eth_signTypedData_v4") return { result: "0xsig" };
			return mustNotCall(method, []);
		});
		expect(await provider.request({ method: "eth_sendTransaction", params: [{}] })).toBe(
			"0xtxhash",
		);
		expect(await provider.request({ method: "eth_signTypedData_v4", params: ["0xabc", {}] })).toBe(
			"0xsig",
		);
		expect(calls.map((c) => c.method)).toEqual(["eth_sendTransaction", "eth_signTypedData_v4"]);
	});

	it("still reports the impersonated address for eth_requestAccounts", async () => {
		const { provider } = build(
			{ address: "0xWhale", chainId: 1, rpcUrl: RPC, impersonated: true },
			mustNotCall,
		);
		expect(await provider.request({ method: "eth_requestAccounts" })).toEqual(["0xwhale"]);
	});

	it("surfaces RPC errors with their JSON-RPC code", async () => {
		const { provider } = build({ address: "0xabc", chainId: 1, rpcUrl: RPC }, () => ({
			error: { code: 3, message: "execution reverted" },
		}));
		await expect(provider.request({ method: "eth_call", params: [{}] })).rejects.toMatchObject({
			code: 3,
		});
	});
});

describe("inject-wallet helpers", () => {
	it("normalizeChainId / toHex / isMethodNotFound", () => {
		expect(normalizeChainId("0x2105")).toBe(8453);
		expect(normalizeChainId("137")).toBe(137);
		expect(normalizeChainId(undefined)).toBeUndefined();
		expect(toHex(31337)).toBe("0x7a69");
		expect(isMethodNotFound({ code: -32601 })).toBe(true);
		expect(isMethodNotFound({ message: "the method foo does not exist" })).toBe(true);
		expect(isMethodNotFound({ code: 3, message: "reverted" })).toBe(false);
	});
});

describe("provider browser-wiring (wireBrowser)", () => {
	class FakeCustomEvent {
		type: string;
		detail: unknown;
		constructor(type: string, init: { detail: unknown }) {
			this.type = type;
			this.detail = init.detail;
		}
	}

	function wire() {
		const events: FakeCustomEvent[] = [];
		const win: Record<string, unknown> = {
			e2eWalletConfig: { address: "0xabc", chainId: 1, rpcUrl: "http://127.0.0.1:8545" },
			fetch: async () => ({ json: async () => ({}) }),
			crypto: { randomUUID: () => "uuid-1" },
			dispatchEvent: (event: FakeCustomEvent) => {
				events.push(event);
				return true;
			},
			addEventListener: () => undefined,
		};
		runProviderInBrowser(win, FakeCustomEvent);
		return { win, events };
	}

	it("injects window.ethereum and announces over EIP-6963", () => {
		const { win, events } = wire();
		expect(typeof win.ethereum).toBe("object");
		const announce = events.find((e) => e.type === "eip6963:announceProvider");
		expect(announce).toBeDefined();
		const detail = announce?.detail;
		const info = detail && typeof detail === "object" && "info" in detail ? detail.info : undefined;
		expect(info && typeof info === "object" && "rdns" in info ? info.rdns : undefined).toBe(
			"io.facets.e2ewallet",
		);
	});

	it("sets e2eConnected and emits accountsChanged on eth_requestAccounts", async () => {
		const { win } = wire();
		const provider = win.ethereum;
		if (
			typeof provider !== "object" ||
			provider === null ||
			!("request" in provider) ||
			!("on" in provider)
		)
			throw new Error("provider not injected");
		const request = provider.request;
		const on = provider.on;
		if (typeof request !== "function" || typeof on !== "function")
			throw new Error("provider shape");

		let changed: unknown;
		on("accountsChanged", (accounts: unknown) => {
			changed = accounts;
		});
		await request({ method: "eth_requestAccounts" });
		expect(win.e2eConnected).toBe(true);
		expect(changed).toEqual(["0xabc"]);
	});
});
