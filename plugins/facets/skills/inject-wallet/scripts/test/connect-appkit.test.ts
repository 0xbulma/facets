// Tests for the in-page AppKit connect driver. We strip connect-appkit.ts and
// run it as a classic script with fake `window`/`document`, exercising the
// shadow-DOM-piercing connect flow. The script also auto-runs once on load; we
// give it an empty DOM at that point so the auto-run is a fast no-op, then build
// the happy-path DOM and call the exported `window.e2eConnect`.

import { describe, expect, it } from "vitest";
import { loadConnectAppkit } from "./strip-eval.ts";

type FakeEl = {
	tagName: string;
	textContent: string;
	shadowRoot: null;
	getBoundingClientRect: () => { width: number; height: number };
	click: () => void;
};
const makeEl = (el: { tagName: string; textContent: string; click: () => void }): FakeEl => ({
	tagName: el.tagName,
	textContent: el.textContent,
	shadowRoot: null,
	getBoundingClientRect: () => ({ width: 10, height: 10 }),
	click: el.click,
});

function setup(initial: { connectedAtLoad?: boolean }) {
	const elements: FakeEl[] = [];
	let connected = Boolean(initial.connectedAtLoad);
	const win: Record<string, unknown> = {
		e2eConnected: connected,
		ethereum: { request: async () => (connected ? ["0xABC123"] : []) },
	};
	const doc: Record<string, unknown> = { querySelectorAll: () => elements, body: {} };
	loadConnectAppkit(win, doc); // auto-run against the empty/initial DOM

	const callConnect = async (): Promise<Record<string, unknown>> => {
		const fn = win.e2eConnect;
		if (typeof fn !== "function") throw new Error("window.e2eConnect not defined");
		return fn();
	};
	const markConnected = () => {
		connected = true;
		win.e2eConnected = true;
	};
	return { elements, win, callConnect, markConnected };
}

describe("connect-appkit", () => {
	it("reports already-connected without clicking", async () => {
		const ctx = setup({ connectedAtLoad: true });
		const result = await ctx.callConnect();
		expect(result.connected).toBe(true);
		expect(result.address).toBe("0xABC123"); // taken verbatim from window.ethereum
		expect(result.clickedConnect).toBe(false);
	});

	it("returns an error when there is no Connect trigger", async () => {
		const ctx = setup({});
		const result = await ctx.callConnect();
		expect(result.connected).toBe(false);
		expect(String(result.error)).toMatch(/no Connect trigger/);
	});

	it("clicks Connect, then the E2E Wallet entry, and connects", async () => {
		const ctx = setup({});
		const walletEntry = makeEl({
			tagName: "wui-list-wallet",
			textContent: "E2E Wallet",
			click: () => ctx.markConnected(),
		});
		const connectBtn = makeEl({
			tagName: "button",
			textContent: "Connect Wallet",
			click: () => ctx.elements.push(walletEntry),
		});
		ctx.elements.push(connectBtn);

		const result = await ctx.callConnect();
		expect(result.clickedConnect).toBe(true);
		expect(result.clickedWallet).toBe(true);
		expect(result.connected).toBe(true);
		expect(result.address).toBe("0xABC123");
	});
});
