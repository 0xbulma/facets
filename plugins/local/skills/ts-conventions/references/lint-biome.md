Use **Biome** as the single lint + formatter (one tool, one config: `biome.json`). Start from `recommended` and enforce as **errors**:

- `noUnusedImports`, `noUnusedVariables` — dead code is a bug, not a warning.
- `noFloatingPromises`, `noMisusedPromises` — every promise is awaited or explicitly handled.
- `useExhaustiveSwitchCases` — switches over unions stay exhaustive.
- `noShadow` — no shadowed bindings.
- `noEnum` — ban TS `enum`; use an `as const` object + derived union instead.
- `noNonNullAssertion`, `noExplicitAny` — back the no-`!` / no-`any` rules above. (Biome has no built-in `as`-cast ban — enforce with a lint plugin or in review.)
- Organize imports automatically (`organizeImports: on`); use `import type` for type-only imports.
- 2-space indentation; keep function arity low — pass an options object once you'd otherwise need more than ~2–3 positional params.

Run `biome check` (lint + format) plus `tsc --noEmit` (typecheck) and the test suite in CI **and** as a pre-commit hook (e.g. husky + lint-staged, or Biome's staged mode). Don't commit warnings.
