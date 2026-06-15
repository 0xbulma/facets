### Stack (preferred defaults)

- **Package manager:** pnpm with workspaces; pin the exact version via the root `package.json` `packageManager` field. Use the `workspace:*` protocol for internal deps.
- **Monorepo task runner:** Turborepo. Define cached `build` / `lint` / `typecheck` / `test` tasks in `turbo.json` and wire `dependsOn` so builds run topologically.
- **Language target:** TypeScript with `module` / `moduleResolution` set to `NodeNext` for libraries (or `bundler` when an app bundler owns resolution), plus `moduleDetection: force`.
- **Lint + format:** one tool for both (see the Lint & format section below).
- **Tests:** Vitest.
- **Runtime validation:** zod — parse every external input at the boundary into domain types.
- **Build:** emit ESM (dual CJS/ESM only when consumers need it); ship `.d.ts` for libraries.

### Frontend stack (preferred)

Preferred defaults for TypeScript web apps — swap per project:

- **Language & tooling:** TypeScript · Biome (lint + format) · pnpm + Turborepo.
- **Framework:** Next.js (App Router) for SSR / full-stack; Vite + React for a pure SPA.
- **Styling & UI:** Tailwind CSS + shadcn/ui (Radix primitives) · `lucide-react` icons · `sonner` for toasts.
- **Forms:** React Hook Form with the zod resolver — reuse one zod schema (see Stack above) across forms, API I/O, and env.
- **Server state / data fetching:** TanStack Query; in Next.js fetch in Server Components first, reach for Query on the client.
- **Client state:** local component state first; **React Context** for genuinely shared client state — no global store by default.
- **Routing (SPA):** TanStack Router or React Router (Next.js App Router owns routing itself).
- **Web3 (when needed):** viem (low-level) + wagmi (React hooks); amounts as `bigint`.
- **Testing:** Vitest + React Testing Library (unit/component) · Playwright (e2e).

### Type system & strictness

- Enable `strict: true` **and** `noUncheckedIndexedAccess: true` and `forceConsistentCasingInFileNames: true`. Libraries also set `declaration: true`.
- **No `any`.** Use `unknown` and narrow with a type guard or a zod parse; reach for generics before widening to `any`. _(Enforce: Biome `noExplicitAny` / ESLint `@typescript-eslint/no-explicit-any`.)_
- **No type assertions (`as Foo`)** — they silence the checker instead of proving the type. A hard-to-type API is usually the wrong shape: redesign before reaching for an escape hatch. Allowed exceptions only:
  - `as const` for literal/tuple inference;
  - `expr satisfies Type` to check a value against a type without widening it;
  - `as unknown as T` **only** at a genuine trust boundary (FFI, deserialization the type system can't see), and only with a justified suppression comment (`// biome-ignore …: reason` or `// @ts-expect-error: reason + linked issue`).
  - Prefer type guards (`x is Foo`), discriminated unions, and exhaustive `switch` over assertions. _(Enforce: ESLint `@typescript-eslint/consistent-type-assertions` with `assertionStyle: never`; Biome via a lint plugin or review.)_
- **No bare `@ts-ignore` / `@ts-expect-error`.** Every suppression carries a reason and a linked issue with a removal plan, or it doesn't ship.
- **No TS `enum`.** Use an `as const` object + a derived union (`type Status = (typeof STATUS)[keyof typeof STATUS]`) or discriminated unions + `satisfies`. _(Enforce: Biome `noEnum` / ESLint `no-restricted-syntax` on `TSEnumDeclaration`.)_
- **Avoid non-null assertions (`!`).** Handle the `undefined`/`null` branch explicitly — `noUncheckedIndexedAccess` exists precisely to surface it. _(Enforce: Biome `noNonNullAssertion` / ESLint `@typescript-eslint/no-non-null-assertion`.)_
- **Prefer inference.** Omit annotations TS can infer (including return types) *inside* a module; annotate the *exported* API explicitly — it's the contract.
- **Branded/opaque types** for IDs, addresses, money, and units (not bare `string`/`number`); reuse shared domain types rather than re-deriving them.
- Prefer `type` aliases for unions/shapes and `interface` for extensible public object contracts; be consistent within a package.

### Modules & exports

- **Prefer named exports.** No default exports except where a framework requires them (e.g. Next.js `page` / `layout` / `route` files).
- Use `import type` for type-only imports.
- **Barrels:** for a published library, the `index.ts` barrel **is** the public-API contract — export exactly the public surface and set `"sideEffects": false`. Inside an app, **avoid** wide re-export barrels (they hurt tree-shaking) — import named symbols directly.

### Lint & format

__LINT_SECTION__

### Tests (colocation)

- **Colocate unit tests with the code they test:** `foo.ts` → `foo.test.ts` in the same folder. (A per-package `__tests__/` folder is acceptable if the repo already standardizes on it — match the existing convention, never mix both in one package.)
- Name unit tests `*.test.ts(x)`. Put integration/e2e in a dedicated top-level `test/` or `e2e/`.
- Test **behavior and edge cases**, not implementation details — including the `undefined` paths that `noUncheckedIndexedAccess` forces you to consider.
- No real network or filesystem in unit tests — mock at the IO boundary (the outer shell), keep the domain core deterministic.

### Naming

- Files: `kebab-case`. Types / classes / React components (the identifiers): `PascalCase`. Functions / variables: `camelCase`. True constants: `UPPER_SNAKE_CASE`.
- Barrel files are `index.ts`; group type-only declarations in `*.types.ts` when it aids discovery. (Test-file naming is covered under Tests above.)
- React component files may be `PascalCase` to match the component where the framework/library convention expects it.
