import { describe, expect, it } from "vitest";
import {
	DEFAULT_ANVIL_CHAIN_ID,
	DEFAULT_ANVIL_PORT,
	DEFAULT_APP_PORT,
	DEV_ACCOUNT_0,
} from "../lib/types.ts";

describe("constants", () => {
	it("DEV_ACCOUNT_0 is a 20-byte hex address", () => {
		expect(DEV_ACCOUNT_0).toMatch(/^0x[0-9a-fA-F]{40}$/);
	});

	it("defaults are sane", () => {
		expect(DEFAULT_ANVIL_PORT).toBe(8545);
		expect(DEFAULT_APP_PORT).toBe(3000);
		expect(DEFAULT_ANVIL_CHAIN_ID).toBe(31337);
	});
});
