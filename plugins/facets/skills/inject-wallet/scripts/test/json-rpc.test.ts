import { afterEach, describe, expect, it, vi } from "vitest";
import { isRecord, jsonRpc, toStringArray, unwrapJsonRpc } from "../lib/json-rpc.ts";

describe("json-rpc helpers", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("isRecord narrows objects only", () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord(null)).toBe(false);
		expect(isRecord("x")).toBe(false);
	});

	it("toStringArray keeps only strings", () => {
		expect(toStringArray(["0xa", 1, "0xb", null])).toEqual(["0xa", "0xb"]);
		expect(toStringArray("nope")).toEqual([]);
	});

	it("unwrapJsonRpc returns result and throws typed errors", () => {
		expect(unwrapJsonRpc({ result: "0x1" })).toBe("0x1");
		expect(unwrapJsonRpc({})).toBeUndefined();
		expect(() => unwrapJsonRpc({ error: { code: -32000, message: "boom" } })).toThrowError(
			expect.objectContaining({ code: -32000, message: "boom" }),
		);
	});

	it("jsonRpc POSTs and unwraps the result", async () => {
		const fetchMock = vi.fn((_url: string, _init: { body: string }) =>
			Promise.resolve({ json: async () => ({ result: "0x2105" }) }),
		);
		vi.stubGlobal("fetch", fetchMock);
		expect(await jsonRpc("http://x", { method: "eth_chainId" })).toBe("0x2105");
		const sent = fetchMock.mock.calls[0]?.[1];
		const body = JSON.parse(sent?.body ?? "{}");
		expect(body).toMatchObject({ jsonrpc: "2.0", method: "eth_chainId", params: [] });
	});
});
