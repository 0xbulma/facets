Use **ESLint** (typed config via `typescript-eslint`) + **Prettier** for formatting. Enforce as **errors**:

- `@typescript-eslint/no-unused-vars` (and `no-unused-imports`) — dead code is a bug, not a warning.
- `@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises` — every promise is awaited or explicitly handled (requires type-aware linting).
- `@typescript-eslint/switch-exhaustiveness-check` — switches over unions stay exhaustive.
- `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion`, and `@typescript-eslint/consistent-type-assertions` (`assertionStyle: never`) — back the no-`any` / no-`!` / no-cast rules.
- `no-restricted-syntax` on `TSEnumDeclaration` — ban TS `enum`; use an `as const` object + derived union instead.
- `no-shadow` (via `@typescript-eslint/no-shadow`); `import/order` for sorted imports; `@typescript-eslint/consistent-type-imports` for `import type`.

Let Prettier own formatting (don't fight it with ESLint style rules). Run `eslint .` + `prettier --check .` + `tsc --noEmit` + tests in CI **and** as a pre-commit hook (husky + lint-staged). Don't commit warnings.
