---
name: ts-conventions
version: 2.2.1
description: Write or refresh structured coding conventions in your global ~/.claude/CLAUDE.md — a language-agnostic Engineering principles section (any repo) plus a TypeScript conventions section (stack, frontend stack, strictness, lint, tests) when a TS stack is detected. Tailors to the current repo's linter/test-runner/React/web3 and injects idempotently inside managed markers. Use when user says /facets:ts-conventions, "set up coding conventions", "write coding standards to CLAUDE.md", "add my engineering principles", or "seed global conventions".
---

# /facets:ts-conventions — Seed global coding conventions

Write a structured conventions block into the user's global `~/.claude/CLAUDE.md` so the
same engineering norms apply across every project. The block has two parts:

1. **`## Engineering principles`** — language-agnostic norms in three altitude tiers:
   **System & solution architecture** (public-API contract, layering, package boundaries,
   security/trust boundaries, supply chain, observability, change management),
   **Application architecture** (functional core, statelessness, I/O isolation, DI, errors,
   idempotency, config), and **Module & code design** (modularity, illegal-states,
   interfaces, function shape, comments/docs, testing) — plus an anti-patterns list. Written
   for **any** repo.
2. **`## TypeScript conventions`** — TS-specific rules (preferred stack, frontend stack,
   type system & strictness incl. no-`any`/no-cast/no-`enum`, modules & exports, lint, tests,
   naming, plus React/Next and web3 when present). Written **only when a TypeScript stack is
   detected**, tailored to the repo's linter and test runner.

Both parts live inside one managed marker pair and are injected **idempotently** so re-runs
refresh in place instead of duplicating. Everything outside the markers — including the
user's existing sections — is left untouched.

This skill writes **only** to the global config. It never modifies a project file.

## Arguments

`$ARGUMENTS` accepts:

- `--preview` — assemble and print the block to the terminal, but do **not** write the file.

No other arguments. The content is derived entirely from detection.

## Instructions

### Step 1: Detect the stack and gather signals

Resolve the repo root and compute signals from the current working directory:

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PKG="$ROOT/package.json"
```

- **IS_TS gate** — true if any of: a `tsconfig*.json` exists anywhere in the repo, OR `package.json` lists `typescript` in dependencies/devDependencies, OR the repo contains `.ts`/`.tsx` files (`git ls-files '*.ts' '*.tsx' | head -1`).
  - If **not** a TypeScript repo, still proceed — you will write the language-agnostic `## Engineering principles` section and **skip** the TypeScript-specific section. (The principles apply to any codebase.)
- **LINTER** — `biome` if `biome.json`/`biome.jsonc` exists or `@biomejs/biome` is a dependency; `eslint` if any `.eslintrc*` / `eslint.config.*` exists or `eslint` is a dependency. If both or neither, **default to `biome`** and set `LINTER_DEFAULTED=1` (so Step 5 can flag that it was guessed, not detected — a Prettier-only or ESLint-in-CI repo would otherwise get the wrong section).
- **TEST_RUNNER** — `vitest` if `vitest` is a dependency or a `vitest.config.*` exists; `jest` if `jest` is present. Default `vitest`. (Used only to phrase the Tests section; Vitest wording is fine for either.)
- **HAS_REACT** — true if `react`, `react-dom`, or `next` is a dependency, OR the repo has `.tsx` files. Includes the React/Next section.
- **HAS_WEB3** — true if `viem`, `wagmi`, or `ethers` is a dependency. Includes the Web3 section.

Detect dependencies across **all** `package.json` files, not just the root — in a monorepo (this skill's own preferred stack) `viem`/`wagmi`/`react`/`eslint` often live only in `apps/*` or `packages/*`:

```bash
PKGS=$(git ls-files 'package.json' '**/package.json')
echo "$PKGS" | xargs grep -lE '"(viem|wagmi|ethers)"' 2>/dev/null   # any hit → HAS_WEB3
```

Use the same workspace-wide scan for the React deps (HAS_REACT), the linter deps (LINTER), and the test runner (TEST_RUNNER). The `git ls-files '*.ts' '*.tsx'` file check is the fallback for IS_TS / HAS_REACT when deps aren't declared locally.

### Step 2: Resolve the target file

Always the global config:

```bash
TARGET="$HOME/.claude/CLAUDE.md"
```

- If it exists, read it in full with the Read tool — you will preserve every existing line.
- If it does not exist, you will create it with a top-level `# Claude Code Instructions` heading followed by the managed block.

### Step 3: Assemble the conventions block

Build the block from modular reference sections. `references/` lives at `${CLAUDE_PLUGIN_ROOT}/skills/ts-conventions/references/`.

**Part 1 — `## Engineering principles` (always).** Take the body of `references/principles.md` verbatim (lead line; the three tiers **System & solution architecture**, **Application architecture**, **Module & code design**; **Anti-patterns to avoid**). It is language-agnostic and written for every repo.

**Part 2 — `## TypeScript conventions` (only when `IS_TS`).** Concatenate:

1. `references/core.md` — the concrete TS rules (Stack, Frontend stack, Type system & strictness, Modules & exports, Lint & format, Tests, Naming).
2. Replace the single line `__LINT_SECTION__` in `core.md` with the body of `references/lint-biome.md` (when `LINTER=biome`) or `references/lint-eslint.md` (when `LINTER=eslint`).
3. Append `references/react-next.md` **only if** `HAS_REACT`.
4. Append `references/web3.md` **only if** `HAS_WEB3`.

Assemble the full block inside one managed marker pair (exact strings — copy verbatim, including the trailing comment text). On a non-TS repo, emit only the `## Engineering principles` section and omit the `## TypeScript conventions` heading entirely:

```
<!-- BEGIN ts-conventions (managed by facets plugin — re-run /facets:ts-conventions to refresh) -->
## Engineering principles

<principles.md body>

## TypeScript conventions

<assembled TS sections — omit this heading and body on a non-TS repo>
<!-- END ts-conventions -->
```

**Before emitting, verify the assembled block contains no literal `__LINT_SECTION__` (or any `__…__` placeholder).** If it does, the linter swap (item 2) was missed — redo it; never write an unsubstituted placeholder into the user's config.

If `--preview` was passed, print this block and stop — **skip Steps 4 and 5 entirely** (no file write, no "written" confirmation).

### Step 4: Inject idempotently

Operate on `$HOME/.claude/CLAUDE.md`:

- **File absent** → create it with:
  ```
  # Claude Code Instructions

  <managed block>
  ```
- **File present, markers already exist** → replace the whole managed block in place. Set the Edit tool's `old_string` to the **exact text currently in the file**, from the `<!-- BEGIN ts-conventions … -->` line through the `<!-- END ts-conventions -->` line inclusive — copy it verbatim from the Step 2 Read. Do **not** reconstruct `old_string` from the freshly assembled block: the two differ whenever the stack changed (a dropped React/web3 section, a switched linter, or an older layout being migrated), and a mismatch would fail the Edit and risk appending a duplicate block. Set `new_string` to the freshly assembled block. Matching the whole marked span guarantees no stale content survives. Touch nothing else.
- **File present, no markers** → append a blank line and the managed block at the end of the file.

Use the Read + Edit/Write tools — **do not** shell out to `sed`: the content contains `|`, `[`/`]`, backticks, and `<!-- -->` markers that interact badly with sed delimiters. Never duplicate the block; never alter the user's other sections.

### Step 5: Confirm

Print a short summary:

```
Conventions written to ~/.claude/CLAUDE.md (created | refreshed in place).
  Engineering principles:  always included
  TypeScript conventions:  included | skipped (not a TS repo)
    Linter section:  Biome | ESLint + Prettier   (detected | defaulted)
    React/Next:      included | skipped
    Web3 (EVM):      included | skipped

Re-run /facets:ts-conventions any time to refresh the block for a different stack.
```

When the TypeScript section is skipped (non-TS repo), omit the indented Linter / React/Next / Web3 sub-lines. When `LINTER_DEFAULTED=1`, print `defaulted` next to the linter line so the user knows to override if it guessed wrong.

### Important notes

- **Global only.** This skill writes exactly one file: `~/.claude/CLAUDE.md`. It never creates or edits a project `CLAUDE.md` / `AGENTS.md`. A repo's own conventions doc always wins over this global block (the block says so in its first line).
- **Idempotent.** A re-run with the same detected stack produces byte-identical content between the markers. Different stacks refresh the block to match.
- **User edits are safe** as long as they stay outside the BEGIN/END markers. Anything between the markers is regenerated on the next run.
- Do NOT commit, branch, or push — this skill writes one file in the user's home directory and stops.
