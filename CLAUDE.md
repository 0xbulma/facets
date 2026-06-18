# CLAUDE.md

Repo-level guidance for Claude Code working on this repo.

## What this repo is

A Claude Code **plugin marketplace** containing a single plugin (`facets`) with thirteen slash-command skills:

- **PR navigation / review / fix** — `pr-switch` (check out a PR's branch from a URL/number), `pr-review-local`, `pr-review-gh`, `pr-fix`, `setup`
- **PR / workflow authoring** — `pr-create` (draft PR from the current diff), `convert-tib-to-linear` (TIB/ADR → Linear project + milestones + issues), `tib-create` (scaffold a new TIB), `tip-create` (scaffold a TIP — concrete implementation plan paired with a TIB), `tib-ship` (yolo execute a TIB end-to-end: scaffold TIPs → implement TDD-style → review→fix loop → ready-to-push branch)
- **Conventions** — `ts-conventions` (write/refresh global `~/.claude/CLAUDE.md` with a language-agnostic `## Engineering principles` section — three altitude tiers from solution architecture down to code design, incl. security/supply-chain/change-management — plus a stack-tailored `## TypeScript conventions` section — preferred stack, frontend stack, type system & strictness, modules/exports, lint/test rules, anti-patterns — inside idempotent managed markers)
- **dApp testing** — `inject-wallet` (boot a dev server + browser, inject a test wallet — EIP-1193 provider announced over EIP-6963 — so an agent gets past the Reown AppKit connect modal, then screenshot the connected UI; Anvil-fork or read-only-RPC backend, env-gated wagmi `mock`-connector fallback; a TypeScript Node CLI under `scripts/` run via native type-stripping, the SKILL.md wraps it)
- **Feedback** — `feedback` (capture a facets improvement idea from any repo as a GitHub issue on the facets repo, or a local backlog with `--local`; grounds the note in the current repo/branch/PR, scrubs sensitive detail for private repos, previews before posting; target defaults to `0xbulma/facets`, override via `--repo` / `FACETS_REPO`)

The review side and its persona library are **optimized for TypeScript + React + Vercel** codebases — JSX/TSX detection, Server Components, React 19 APIs, Tailwind, Vercel's Web Interface Guidelines, Web3 (viem/wagmi/ethers) when present, and route-level runtime validation via `agent-browser`. It works on any project, but the conditional personas are tuned for the TS/React/Vercel stack. The four authoring skills (`pr-create`, `convert-tib-to-linear`, `tib-create`, `tip-create`) are repo-agnostic; `tib-ship` is repo-agnostic for orchestration but its inner per-block loop and `runtime-validation` step assume a JS/TS toolchain.

Users install via `/plugin marketplace add 0xbulma/facets` → `/plugin install facets@facets`. They invoke the skills as `/facets:pr-switch`, `/facets:pr-review-local`, `/facets:pr-review-gh`, `/facets:pr-fix`, `/facets:setup`, `/facets:pr-create`, `/facets:convert-tib-to-linear`, `/facets:tib-create`, `/facets:tip-create`, `/facets:tib-ship`, `/facets:ts-conventions`, `/facets:inject-wallet`, `/facets:feedback`.

## Mental model

```
.claude-plugin/marketplace.json
        │
        └─ lists ─→ plugins/facets/
                          │
                          ├─ .claude-plugin/plugin.json
                          ├─ skills/
                          │   ├─ {pr-switch,pr-review-local,pr-review-gh,pr-fix,setup,
                          │   │    pr-create,convert-tib-to-linear,tib-create,tip-create,tib-ship,
                          │   │    ts-conventions,inject-wallet,feedback}/SKILL.md
                          │   └─ pr-review-engine/
                          │       ├─ SKILL.md             ← shared Steps 3–6 (the dispatcher)
                          │       ├─ agents/*.md          ← 16 versioned reviewers (6 baseline + 10 conditional)
                          │       ├─ references/*.md      ← shared rubrics loaded on demand by agents
                          │       └─ scripts/             ← deterministic helpers (changed-lines build, finding validation, fix-rubric discovery)
                          ├─ hooks/hooks.json            ← SessionStart auto-install
                          └─ bin/install-prereqs.sh      ← idempotent prereq install
```

One-way arrow: the four PR-flow skills (`pr-review-gh`, `pr-review-local`, `pr-fix`, `tib-ship`) delegate Steps 3–6 to `skills/pr-review-engine/SKILL.md`, which walks `skills/pr-review-engine/agents/*.md` and fans out one sub-agent per matching file. The engine is a real skill following the Anthropic `skill-creator` pattern (`SKILL.md` + `agents/` + `references/`). Nothing points back up.

## Rubric prereqs (auto-installed)

17 external skills from the [skills.sh](https://skills.sh) registry serve as runtime rubric for the conditional personas (16 Vercel-published, 1 community: `tailwind-design-system`). They are *not* Claude Code plugin dependencies (the `dependencies` field in `plugin.json` only resolves other plugins) — they're standalone skills installed via `npx skills add`.

| Skill | Source | Backs persona |
|---|---|---|
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | `react-next` |
| `vercel-composition-patterns` | `vercel-labs/agent-skills` | `react-next` |
| `vercel-react-native-skills` | `vercel-labs/agent-skills` | `react-next` (RN files only) |
| `next-best-practices` | `vercel-labs/next-skills` | `react-next` |
| `next-cache-components` | `vercel-labs/next-skills` | `react-next` |
| `building-components` | `vercel/components.build` | `react-next`, `styling`, `accessibility` |
| `web-design-guidelines` | `vercel-labs/agent-skills` | `styling`, `accessibility` |
| `tailwind-design-system` | `wshobson/agents` | `styling` |
| `ai-elements` | `vercel/ai-elements` | `ai-sdk`, `styling` |
| `streamdown` | `vercel/streamdown` | `ai-sdk`, `styling` |
| `ai-sdk` | `vercel/ai` | `ai-sdk` |
| `turborepo` | `vercel/turborepo` | `ci-security` (when turbo.json touched) |
| `deploy-to-vercel` | `vercel-labs/agent-skills` | `release-integrity` (when vercel.json / deploy touched) |
| `vercel-cli-with-tokens` | `vercel-labs/agent-skills` | `release-integrity` (when vercel CLI touched) |
| `agent-browser` | `vercel-labs/agent-browser` | utility (browser automation) |
| `find-skills` | `vercel-labs/skills` | utility (skill discovery) |
| `before-and-after` | `vercel-labs/before-and-after` | utility (visual diff) |

Installation mechanism (in order of automation):

1. **SessionStart hook** (`hooks/hooks.json`) — runs `bin/install-prereqs.sh` silently in the background every Claude Code session. Idempotent: skills already present at `~/.claude/skills/<name>/SKILL.md` are skipped. Failure on any one skill does not block the session.
2. **Manual fallback** — `/facets:setup` runs the same script with verbose output. Use this when the hook failed (no network at startup) or to verify install state.

If a prereq is absent at review time, the consuming persona logs `Marketplace skill not found: <name> — degrading to persona's built-in rubric below` and falls through to the inline rubric in its body. No hard failure.

## Local development loop

```bash
claude --plugin-dir ./plugins/facets
# inside Claude Code:
/reload-plugins   # after edits
```

The SessionStart hook fires on each `claude` invocation, so prereqs install the first time you load the plugin locally too.

## Path resolution inside `SKILL.md`

- **Plugin-local files** (`skills/pr-review-engine/{SKILL.md,agents,references}`, `bin`): use `${CLAUDE_PLUGIN_ROOT}/...`. The variable is set by Claude Code to the installed plugin's root directory.
- **Rubric skills**: discover at run time via Bash:
  ```bash
  find ~/.claude -type f -name SKILL.md -path "*<skill-name>*" 2>/dev/null | head -1
  ```
  Catches both the plugin cache (`~/.claude/plugins/cache/...`) and the `npx skills` install location (`~/.claude/skills/<name>/SKILL.md`).

## Versioning

Three levels of versioning, all semver:

1. **Plugin version** — `plugins/facets/.claude-plugin/plugin.json` `version`. The release pin users see in `/plugin marketplace update`. **Bump on every PR that changes anything in `plugins/facets/`** (description, SKILL.md, agents, hooks, bin). The marketplace updater keys cache invalidation off this field — if it doesn't move, `/plugin marketplace update` short-circuits and existing installs keep serving the stale cache forever (the description text, the `agents/` roster, the install script, all of it). The README and `plugin.json` description can disagree with reality for weeks and you'd never know.
2. **Per-skill version** — `version:` in each `SKILL.md` frontmatter. Lets you ship a skill-level changelog without bumping the whole plugin.
3. **Per-agent version** — `version:` in each `plugins/facets/skills/pr-review-engine/agents/*.md` frontmatter. Agents evolve fast; per-file versioning lets us track rubric drift independently.

Semver rules:

- **Patch** — prompt edits that don't change behavior.
- **Minor** — new persona, new conditional flag, new prereq, new rubric section.
- **Major** — trigger-flag rename, severity-grading change, or any breaking output-shape change.

## Agent contract

Every file in `plugins/facets/skills/pr-review-engine/agents/` has YAML frontmatter:

```yaml
---
name: <slug>
version: <semver>
kind: baseline | conditional
trigger: <FLAG_NAME>      # only for conditional, e.g. <HAS_WEB3>
applies: |
  <one-liner: where this persona's rules come from>
out-of-scope:
  - <what to defer to other personas, by name>
focus: <one-line scope>
---
```

Severity calibration lives in the body as a `## Severity guidance` section (a few agents carry it as `severity-guidance:` frontmatter instead — either is fine, but every agent must have one).

Adding an agent = drop a new file in `plugins/facets/skills/pr-review-engine/agents/`. If `kind: conditional`, also extend the flag-detection block in Step 4 of `plugins/facets/skills/pr-review-engine/SKILL.md`. **Bump the plugin `version`** in `plugins/facets/.claude-plugin/plugin.json` (see Versioning above) — without it, existing installs will never see the new agent.

## Forking notes

- **Per-org Web3 SDK**: extend the `<HAS_WEB3>` detector in `skills/pr-review-engine/SKILL.md` Step 4 and `skills/pr-fix/SKILL.md` Steps 4.5/5d.1/12 to include `@your-org/*`.
- **Different prereq set**: edit the `PREREQS` heredoc in `bin/install-prereqs.sh`. Each line is `<install-target-name> <owner/repo@skill>`. The persona Bash `find` will discover whatever lands in `~/.claude/skills/<name>/`.

## Testing

```bash
bats test/                  # plugin.bats — manifest, frontmatter, version fields, agent/trigger invariants
pnpm install && pnpm verify # all skill TS scripts: Biome + tsc + Vitest
```

- `test/plugin.bats` — manifest shape, skill discovery, frontmatter (including the `version:` field), agent/trigger invariants, no leaked legacy paths, hook + bin presence, and (if `claude` CLI is on PATH) a local plugin-dir smoke install.
- **Skill TypeScript scripts** — the only non-doc source in the repo. Root `biome.json` (strict), `tsconfig.json` (extends `tsconfig.base.json`), `vitest.config.ts` — all scoped to `plugins/facets/skills/**/scripts/**`. `pnpm verify` runs `biome check` + `tsc -p tsconfig.json` + `vitest run`. Covers the `inject-wallet` scripts and the `pr-review-engine` helpers (`build-changed-lines.ts`, `validate-findings.ts`, each with a colocated `*.test.ts`). The scripts run dependency-free via Node's native type-stripping (Node ≥ 22.18); the toolchain is dev-only (`node_modules/` is gitignored).

## Common gotchas

- **Don't put `commands/` or `skills/` inside `.claude-plugin/`.** Only `plugin.json` lives in `.claude-plugin/`.
- **Don't reference files outside the plugin root** (`../shared-utils`). Plugins are copied to a cache; siblings won't come along.
- **Don't reintroduce `<HOME>` template substitution.** The marketplace install model handles paths automatically.
- **Don't try to declare rubric skills in `plugin.json` `dependencies`.** That field only resolves other plugins (different ecosystem from `npx skills`). Use the SessionStart hook + setup skill instead.
- **`npx` consumes stdin** when called inside a `while read` loop — always pass `</dev/null` to the install command.
- **Don't forget to bump `plugin.json` `version` in any PR touching `plugins/facets/`.** `/plugin marketplace update` keys cache invalidation off this field — leave it the same and every existing install keeps serving the old description, old agent roster, old hook script. This bit us once: 2.3.0 sat unchanged for two days while the description and the agents/ layout were rewritten in place; users kept seeing the original 11-persona text from the May 19 install. See the Versioning section for semver rules (patch/minor/major).
