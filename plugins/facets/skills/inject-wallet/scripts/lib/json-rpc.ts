// Tiny JSON-RPC helper shared by the Node-side orchestrator (anvil + chainId
// probe). No `as` casts: responses are narrowed with runtime type guards.

export type RpcError = Error & { code?: number };

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Keep only the string entries of an unknown array. */
export function toStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Extract `result` from a JSON-RPC response; throw a typed RpcError on `error`. */
export function unwrapJsonRpc(json: unknown): unknown {
	if (!isRecord(json)) return undefined;
	if ("error" in json && json.error) {
		const err = json.error;
		const message = isRecord(err) && typeof err.message === "string" ? err.message : "RPC error";
		const rpcError: RpcError = new Error(message);
		if (isRecord(err) && typeof err.code === "number") rpcError.code = err.code;
		throw rpcError;
	}
	return "result" in json ? json.result : undefined;
}

/** POST a single JSON-RPC call and return the unwrapped result. */
export async function jsonRpc(
	rpcUrl: string,
	call: { method: string; params?: unknown[] },
): Promise<unknown> {
	const res = await fetch(rpcUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: call.method, params: call.params ?? [] }),
	});
	return unwrapJsonRpc(await res.json());
}
