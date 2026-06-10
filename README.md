# claude-skills

A Claude Code [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces) for **TypeScript + React + Vercel**-optimized PR review, PR fix, and decision-record / Linear workflows. Ships one plugin (`local`) with ten user-invokable slash-command skills plus one engine skill (`pr-review-engine`), which dispatches a 15-agent review library (6 baseline + 9 conditional, including `runtime-validation` which auto-fires on route-level UI changes), and a SessionStart hook that auto-installs 18 rubric skills (16 [Vercel-published](https://vercel.com/docs/agent-resources/skills) + 2 community) from the [skills.sh](https://skills.sh) registry.

Works on any project — but the conditional personas are tuned for TS/JS/JSX/TSX codebases, with Vercel's `vercel-react-best-practices` / `web-design-guidelines` / `vercel-composition-patterns`, Tailwind, and Web3 (viem/wagmi/ethers) as runtime rubric.

## What's in here

```
.
├── .claude-plugin/
│   └── marketplace.json
├── plugins/local/
│   ├── .claude-plugin/plugin.json
│   ├── skills/
│   │   ├── pr-switch/SKILL.md        # /local:pr-switch <pr-url-or-num>
│   │   ├── pr-review-local/SKILL.md  # /local:pr-review-local
│   │   ├── pr-review-gh/SKILL.md     # /local:pr-review-gh <PR>
│   │   ├── pr-fix/SKILL.md           # /local:pr-fix <PR>
│   │   ├── pr-create/SKILL.md        # /local:pr-create
│   │   ├── extract-plan/SKILL.md     # /local:extract-plan <doc> [project]
│   │   ├── tib-create/SKILL.md       # /local:tib-create <title>
│   │   ├── tip-create/SKILL.md       # /local:tip-create <title> [--tib <path>]…
│   │   ├── tib-ship/SKILL.md         # /local:tib-ship <tib-path> [--max-iters N] [--no-runtime]
│   │   ├── setup/SKILL.md            # /local:setup
│   │   └── pr-review-engine/         # shared review engine (was lib/ + personas/)
│   │       ├── SKILL.md                          # dispatcher: Steps 3–6
│   │       ├── agents/                           # 15 reviewers (6 baseline + 9 conditional)
│   │       │   ├── correctness.md                   # baseline
│   │       │   ├── docs.md                            # baseline
│   │       │   ├── performance.md                    # baseline
│   │       │   ├── error-handling.md          # baseline
│   │       │   ├── simplification.md                 # baseline
│   │       │   ├── tests.md                  # baseline
│   │       │   ├── accessibility.md                  # conditional (<HAS_TAILWIND> OR <HAS_STYLING>)
│   │       │   ├── ai-sdk.md          # conditional (<HAS_AI_SDK>)
│   │       │   ├── ci-security.md                    # conditional (<HAS_WORKFLOWS>)
│   │       │   ├── dependencies.md                   # conditional (<HAS_DEPS>)
│   │       │   ├── react-next.md      # conditional (<HAS_REACT>)
│   │       │   ├── release-integrity.md              # conditional (<HAS_RELEASE>)
│   │       │   ├── runtime-validation.md             # conditional (<HAS_ROUTE_UI>)
│   │       │   ├── styling.md                        # conditional (<HAS_TAILWIND> OR <HAS_STYLING>)
│   │       │   └── web3.md                  # conditional (<HAS_WEB3>)
│   │       ├── references/                       # shared rubrics loaded on demand
│   │       └── scripts/                          # deterministic helpers (changed-lines, finding validation)
│   ├── hooks/hooks.json              # SessionStart auto-install
│   ├── bin/install-prereqs.sh        # idempotent prereq installer
│   └── README.md
├── CLAUDE.md                         # guidance for Claude Code working in this repo
└── test/                             # bats + python suites (manifest, frontmatter, scripts)
```

## Skills

**PR navigation / review / fix**

- **`/local:pr-switch <pr-url-or-num>`** — switch the local checkout to a PR's head branch. Accepts a full GitHub PR URL, `owner/repo#num` shorthand, or a bare number. Refuses cross-repo URLs; resolves a dirty tree interactively (stash/commit/discard/abort).
- **`/local:pr-review-local`** — pre-PR review on the working tree (committed + uncommitted). Terminal output. `--fix` applies mechanical fixes.
- **`/local:pr-review-gh <PR>`** — review an open GitHub PR (diff computed locally, never via the GitHub API). Posts findings as a `COMMENT` review (never auto-approves). `--watch` re-runs on every new commit.
- **`/local:pr-fix <PR>`** — read unresolved review comments, classify, apply confidence-gated fixes, push, reply, resolve. `--watch` runs a 5-minute cron fix loop (don't pair it with a `pr-review-gh --watch` on the same PR — the two watchers re-trigger each other).

**PR / workflow authoring**

- **`/local:pr-create`** — open a draft PR from the current diff. Derives branch name, title, body, and label without asking.
- **`/local:extract-plan <doc> [project]`** — convert a TIB / ADR / RFC into a Linear project plan (milestones + issues with dependencies).
- **`/local:tib-create <title>`** — scaffold a new TIB markdown file from the template; pre-fills date, author, and CalVer ID.
- **`/local:tip-create <title> [--tib <path>]…`** — scaffold a TIP (Technical Implementation Plan): the mutable, concrete companion to a TIB. Optionally seeded from one or more TIBs; auto-maintains `Sibling TIP(s)` back-links across TIPs that share a parent TIB.
- **`/local:tib-ship <tib-path>`** — yolo execute a TIB end-to-end: scaffold TIPs, branch, implement, then `review → fix → re-review` until clean (max 5 iterations). Runs the `runtime-validation` persona if UI surfaces changed. Stops with a ready-to-push branch; does not push or open a PR.

**Utility**

- **`/local:setup`** — manually install the rubric prereqs (also runs in the background on every session start).

## Rubric prereqs (auto-installed)

18 external skills (16 [Vercel-published](https://vercel.com/docs/agent-resources/skills), 2 community) are installed automatically on first session after plugin install via a `SessionStart` hook. Idempotent — re-runs skip already-installed skills.

| Skill | Source | Domain | Persona it backs |
|---|---|---|---|
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | React/Next.js perf | `react-next` |
| `vercel-composition-patterns` | `vercel-labs/agent-skills` | React composition | `react-next` |
| `vercel-react-native-skills` | `vercel-labs/agent-skills` | React Native + Expo | `react-next` (RN files) |
| `next-best-practices` | `vercel-labs/next-skills` | Next.js conventions, RSC | `react-next` |
| `next-cache-components` | `vercel-labs/next-skills` | Next.js 16 Cache Components | `react-next` |
| `building-components` | `vercel/components.build` | Composable UI components | `react-next`, `styling`, `accessibility` |
| `web-design-guidelines` | `vercel-labs/agent-skills` | Vercel Web Interface Guidelines | `styling`, `accessibility` |
| `tailwind-design-system` | `wshobson/agents` | Tailwind v4, design tokens | `styling` |
| `ai-elements` | `vercel/ai-elements` | AI chat UI components | `ai-sdk`, `styling` |
| `streamdown` | `vercel/streamdown` | Streaming Markdown renderer | `ai-sdk`, `styling` |
| `ai-sdk` | `vercel/ai` | Vercel AI SDK | `ai-sdk` |
| `turborepo` | `vercel/turborepo` | Monorepo build orchestration | `ci-security` |
| `deploy-to-vercel` | `vercel-labs/agent-skills` | Vercel deployment | `release-integrity` |
| `vercel-cli-with-tokens` | `vercel-labs/agent-skills` | Vercel CLI / tokens | `release-integrity` |
| `github-actions-docs` | `xixu-me/skills` | GitHub Actions docs | `ci-security` |
| `agent-browser` | `vercel-labs/agent-browser` | Browser automation | utility |
| `find-skills` | `vercel-labs/skills` | Skill discovery | utility |
| `before-and-after` | `vercel-labs/before-and-after` | Visual before/after diff | utility |

If any are missing at review time, the consuming persona logs a degradation warning and falls back to its inline rubric — no hard failure. Manual install: run `/local:setup` from Claude Code, or invoke `bin/install-prereqs.sh` directly.

### Why not plugin `dependencies`?

Claude Code's `plugin.json` `dependencies` field only resolves other **plugins** (in the marketplace ecosystem). The 18 rubric skills above live in the parallel [skills.sh](https://skills.sh) / `npx skills` ecosystem, so we install them via SessionStart hook + a verbose `/local:setup` skill instead.

## Other prerequisites

- `gh` CLI authenticated (`gh auth status`) — for the GitHub PR skills.
- `git` ≥ 2.30 — for `--name-status --find-renames`.
- `npx` (Node) — for the prereq installer.

## Install

From inside Claude Code:

```
# 1. Add the marketplace (one-time)
/plugin marketplace add 0xbulma/claude-skills

# 2. Install the plugin (one-time)
/plugin install local@claude-skills

# 3. Reload so the SessionStart hook fires
/reload-plugins
#    (or quit and start a new Claude Code session)
#
#    On first fire, the hook runs bin/install-prereqs.sh in the background,
#    fetching the 18 rubric skills via `npx skills add`. First run takes
#    ~30-90s. Subsequent sessions are instant (idempotent skip).

# 4. Optional — verify install state, see one ✓ per skill
/local:setup
```

Make sure `npx` (Node.js), `gh` (authenticated), and `git` ≥ 2.30 are on `PATH` before step 1 — see [Prerequisites](#other-prerequisites) below.

### Local-only (without publishing)

Test the plugin straight from a clone, no marketplace round-trip:

```bash
claude --plugin-dir ./plugins/local
```

The SessionStart hook fires the same way; the 18 rubric skills auto-install on session start.

## Update

```
/plugin marketplace update claude-skills
```

The plugin's `version` field in `plugins/local/.claude-plugin/plugin.json` controls when users see a new release. Each `SKILL.md` and persona also has its own `version:` field for per-file change tracking.

## Local development

After editing any file under `plugins/local/`, run `/reload-plugins` inside Claude Code to pick up changes — no restart needed. Run `bats test/` (manifest, frontmatter, version fields, hook wiring, agent inventory, trigger-flag wiring, references/ backlinks, changed-lines builder) and `cd test && python3 -m unittest test_validate_findings` (finding validator) to validate.

See [CLAUDE.md](./CLAUDE.md) for the full mental model, persona contract, versioning rules, and forking notes.

## Agents

6 baseline (always fire):

- `correctness` — type discipline, code smells, naming, security primitives.
- `error-handling` — swallowed errors, missing error states, dead code paths.
- `docs` — JSDoc/TSDoc on exports, Markdown accuracy, pointer integrity.
- `tests` — missing tests, layout enforcement.
- `simplification` — unnecessary complexity, redundant logic, over-engineering.
- `performance` — barrel imports, memory leaks, N+1, memoization correctness.

9 conditional (fire only when their flag matches the diff):

- `react-next` — `<HAS_REACT>` — Server Components, hooks, React 19 APIs, Next.js conventions, Cache Components. Loads `vercel-react-best-practices`, `vercel-composition-patterns`, `next-best-practices`, `next-cache-components`, `building-components` (+ `vercel-react-native-skills` when RN code detected).
- `styling` — `<HAS_TAILWIND> OR <HAS_STYLING>` — Tailwind, design tokens, styling-architecture consistency. Loads `tailwind-design-system`, `web-design-guidelines`, `building-components` (+ `ai-elements`/`streamdown` when their imports are present).
- `accessibility` — `<HAS_TAILWIND> OR <HAS_STYLING>` — ARIA, keyboard nav, focus management, alt text, label association. Loads `web-design-guidelines`, `building-components`.
- `ai-sdk` — `<HAS_AI_SDK>` — Vercel AI SDK usage, streaming, tool calls, structured output, useChat. Loads `ai-sdk`, `ai-elements`, `streamdown`.
- `web3` — `<HAS_WEB3>` — contract calls, permits, chainId validation, signature handling.
- `ci-security` — `<HAS_WORKFLOWS>` — workflow injection, action pinning, `permissions:` scopes, secret exposure. Loads `github-actions-docs`, `turborepo`.
- `release-integrity` — `<HAS_RELEASE>` — publish flow, provenance, release-commit signing, Changesets wiring. Loads `deploy-to-vercel`, `vercel-cli-with-tokens`.
- `dependencies` — `<HAS_DEPS>` — lockfile drift, `.npmrc` hygiene, typosquats, postinstall scripts.
- `runtime-validation` — `<HAS_ROUTE_UI>` — boots the dev server, navigates the changed route(s), captures console errors / network 4xx-5xx / screenshots. Loads `agent-browser`; `tib-ship` excludes it from its iteration loop and runs it once after static convergence.

## License

MIT — fork, adapt, re-use freely. See [LICENSE](./LICENSE).
