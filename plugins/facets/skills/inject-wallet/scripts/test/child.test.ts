import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { adaptChild } from "../lib/child.ts";

describe("adaptChild", () => {
	it("exposes live exitCode/stdout and forwards kill", async () => {
		const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
		const wrapped = adaptChild(child);
		expect(wrapped.exitCode).toBeNull();
		expect(wrapped.stdout).not.toBeNull();

		wrapped.kill("SIGTERM");
		expect(wrapped.killed).toBe(true);
		await once(child, "exit");
		expect(wrapped.exitCode === null && child.signalCode === null).toBe(false);
	});
});
