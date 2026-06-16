import type { ChildLike } from "../lib/child.ts";

const noop = () => undefined;

/** A ChildLike that never emits output; `exitCode` simulates a live/dead process. */
export function fakeChild(exitCode: number | null = null): ChildLike {
	return {
		stdout: { on: noop },
		stderr: { on: noop },
		on: noop,
		exitCode,
		killed: false,
		kill: noop,
	};
}
