// Minimal child-process surface used by the anvil / dev-server lifecycle
// helpers. Injecting a `Spawner` that returns a `ChildLike` lets the tests drive
// the readiness loop with a fake process — no real binary, no flaky timing.

import type { ChildProcess } from "node:child_process";

type Listenable = { on: (event: string, cb: (chunk: Buffer) => void) => void };

export type ChildLike = {
	readonly stdout: Listenable | null;
	readonly stderr: Listenable | null;
	on: (event: string, cb: (arg: unknown) => void) => void;
	readonly exitCode: number | null;
	readonly killed: boolean;
	kill: (signal?: NodeJS.Signals) => void;
};

/** Adapt a Node ChildProcess to ChildLike, keeping exitCode/killed live via getters. */
export function adaptChild(child: ChildProcess): ChildLike {
	return {
		stdout: child.stdout,
		stderr: child.stderr,
		on: (event, cb) => {
			child.on(event, cb);
		},
		get exitCode() {
			return child.exitCode;
		},
		get killed() {
			return child.killed;
		},
		kill: (signal) => {
			child.kill(signal);
		},
	};
}
