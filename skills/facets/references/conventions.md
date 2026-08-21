# Install engineering conventions

Only option: `--preview`; reject others. Resolve repo root and scan tracked source/config plus every tracked `package.json`. TypeScript = any `tsconfig*`, `typescript` dependency, or tracked `.ts`/`.tsx`; React/Next/RN = matching dependencies or `.tsx`; Web3 = `viem`, `wagmi`, or `ethers`. Detect the package manager. Select the one detected linter; when both or neither Biome and ESLint are detected, select Biome and report that it was defaulted.

Target a nonempty `${CODEX_HOME:-$HOME/.codex}/AGENTS.override.md` when present; otherwise `${CODEX_HOME:-$HOME/.codex}/AGENTS.md`. Project instructions remain higher precedence.

Reuse the canonical bodies under `../../plugins/facets/skills/ts-conventions/references/`—do not paraphrase them:

- Always `principles.md` under `## Engineering principles`.
- For TypeScript, `core.md` under `## TypeScript conventions`, replacing `__LINT_SECTION__` with exactly one of `lint-biome.md` or `lint-eslint.md`.
- Append `react-next.md` and `web3.md` only when detected.

Wrap the result in one managed span:

`<!-- BEGIN ts-conventions (managed by facets plugin — re-run $facets ts-conventions to refresh) -->`

`<!-- END ts-conventions -->`

Verify no `__…__` placeholder remains. `--preview` prints the span and writes nothing. Otherwise preserve every byte outside it: create the target with `# Codex Instructions` if absent, replace one exact existing span, or append when absent. Stop on malformed/duplicate markers; never guess or duplicate. Re-running the same stack must be byte-identical. Never edit project files. Report target, action, package manager, linter (including `defaulted`), and detected conditional sections.
