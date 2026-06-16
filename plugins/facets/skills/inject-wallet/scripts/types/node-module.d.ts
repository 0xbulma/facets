// `node:module` gained stripTypeScriptTypes in Node 22.13 (used to strip the
// browser-injected scripts at run time). It is not yet declared by the pinned
// @types/node, so we augment the module here.
declare module "node:module" {
	export function stripTypeScriptTypes(
		code: string,
		options?: { mode?: "strip" | "transform"; sourceMap?: boolean; sourceUrl?: string },
	): string;
}
