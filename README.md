```
   ███████╗ █████╗  ██████╗███████╗████████╗███████╗
   ██╔════╝██╔══██╗██╔════╝██╔════╝╚══██╔══╝██╔════╝
   █████╗  ███████║██║     █████╗     ██║   ███████╗
   ██╔══╝  ██╔══██║██║     ██╔══╝     ██║   ╚════██║
   ██║     ██║  ██║╚██████╗███████╗   ██║   ███████║
   ╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝   ╚═╝   ╚══════╝

   ◆ ◇ ◆  self-review every facet of your PR, then ship it
```

# facets

> **F**ullstack&nbsp;·&nbsp;**A**gentic&nbsp;·&nbsp;**C**laude&nbsp;·&nbsp;**E**ngine&nbsp;·&nbsp;**T**ypeScript&nbsp;·&nbsp;**S**hipping
>
> **Self-review every _facet_ of your PR — then ship it.** A 17-agent Claude review engine that runs locally, with no cloud review bill.

A Claude Code [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces) for **TypeScript + React + Vercel**-optimized PR review, PR fix, and decision-record / Linear workflows. Ships one plugin (`facets`) with fourteen user-invokable slash-command skills plus one engine skill (`pr-review-engine`), which dispatches a 17-agent review library (6 baseline + 11 conditional, including `runtime-validation` which auto-fires on route-level UI changes), and a SessionStart hook that auto-installs 17 rubric skills (16 [Vercel-published](https://vercel.com/docs/agent-resources/skills) + 1 community) from the [skills.sh](https://skills.sh) registry.

Works on any project — but the conditional personas are tuned for TS/JS/JSX/TSX codebases, with Vercel's `vercel-react-best-practices` / `web-design-guidelines` / `vercel-composition-patterns`, Tailwind, and Web3 (viem/wagmi/ethers) as runtime rubric.

## Quick install

Four commands inside Claude Code, in order:

```
/plugin marketplace add 0xbulma/facets   # 1 · add the marketplace (one-time)
/plugin install facets@facets            # 2 · install the plugin (one-time)
/reload-plugins                          # 3 · reload to load the plugin + its /facets:setup command
/facets:setup                            # 4 · install the 17 rubric deps + verify — one ✓ per skill
```

Prereqs: `npx` (Node.js), `gh` (authenticated), `git` ≥ 2.30 on `PATH` — see [Prerequisites](#other-prerequisites).

## What's in here

```
.
├── .claude-plugin/
│   └── marketplace.json
├── plugins/facets/
│   ├── .claude-plugin/plugin.json
│   ├── skills/
│   │   ├── pr-switch/SKILL.md             # /facets:pr-switch <pr-url-or-num>
│   │   ├── pr-review-local/SKILL.md       # /facets:pr-review-local
│   │   ├── pr-review-gh/SKILL.md          # /facets:pr-review-gh <PR>
│   │   ├── pr-fix/SKILL.md                # /facets:pr-fix <PR>
│   │   ├── pr-create/SKILL.md             # /facets:pr-create
│   │   ├── convert-tib-to-linear/SKILL.md # /facets:convert-tib-to-linear <doc> [project]
│   │   ├── tib-create/SKILL.md            # /facets:tib-create <title>
│   │   ├── tip-create/SKILL.md            # /facets:tip-create <title> [--tib <path>]…
│   │   ├── tib-ship/SKILL.md              # /facets:tib-ship <tib-path> [--max-iters N] [--no-runtime]
│   │   ├── ts-conventions/SKILL.md        # /facets:ts-conventions [--preview]
│   │   ├── inject-wallet/SKILL.md        # /facets:inject-wallet [--anvil|--rpc] [--url …]
│   │   ├── feedback/SKILL.md              # /facets:feedback <note>
│   │   ├── implement-feedback/SKILL.md    # /facets:implement-feedback <issue>
│   │   ├── setup/SKILL.md                 # /facets:setup
│   │   └── pr-review-engine/              # shared review engine (dispatcher + agents + references)
│   │       ├── SKILL.md                   # dispatcher: Steps 3–6
│   │       ├── agents/                    # 17 reviewers (6 baseline + 11 conditional)
│   │       │   ├── correctness.md         # baseline
│   │       │   ├── docs.md                # baseline
│   │       │   ├── performance.md         # baseline
│   │       │   ├── error-handling.md      # baseline
│   │       │   ├── simplification.md      # baseline
│   │       │   ├── tests.md               # baseline
│   │       │   ├── accessibility.md       # conditional (<HAS_STYLING> OR <HAS_REACT>)
│   │       │   ├── ai-sdk.md              # conditional (<HAS_AI_SDK>)
│   │       │   ├── api-security.md        # conditional (<HAS_SERVER_API>)
│   │       │   ├── ci-security.md         # conditional (<HAS_WORKFLOWS>)
│   │       │   ├── dependencies.md        # conditional (<HAS_DEPS>)
│   │       │   ├── react-next.md          # conditional (<HAS_REACT>)
│   │       │   ├── release-integrity.md   # conditional (<HAS_RELEASE>)
│   │       │   ├── runtime-validation.md  # conditional (<HAS_ROUTE_UI>)
│   │       │   ├── skill-authoring.md      # conditional (<HAS_PLUGIN_SKILLS>)
│   │       │   ├── styling.md             # conditional (<HAS_TAILWIND> OR <HAS_STYLING>)
│   │       │   └── web3.md                # conditional (<HAS_WEB3>)
│   │       ├── references/                # shared rubrics loaded on demand
│   │       └── scripts/                   # deterministic helpers, TypeScript run via node (changed-lines, finding validation, findings-ledger merge)
│   ├── hooks/hooks.json                   # SessionStart auto-install
│   ├── bin/install-prereqs.sh             # idempotent prereq installer
│   └── README.md
├── CLAUDE.md                              # guidance for Claude Code working in this repo
└── test/                                  # bats suite (manifest, frontmatter); TS script tests run via pnpm verify
```

## Skills

**PR navigation / review / fix**

- **`/facets:pr-switch <pr-url-or-num>`** — switch the local checkout to a PR's head branch. Accepts a full GitHub PR URL, `owner/repo#num` shorthand, or a bare number. Refuses cross-repo URLs; resolves a dirty tree interactively (stash/commit/discard/abort).
- **`/facets:pr-review-local`** — pre-PR review on the working tree (committed + uncommitted). Terminal output. `--fix` applies mechanical fixes once (unstaged); `--goal` loops review→fix→re-review, committing each iteration, until no critical/high/medium findings remain (`--max-iters`, default 5; `--no-runtime` to skip the post-convergence runtime check); `--fast` skips the `docs` agent (cheapest meaningful cut on code-focused diffs).
- **`/facets:pr-review-gh <PR>`** — review an open GitHub PR (diff computed locally, never via the GitHub API). Posts findings as a `COMMENT` review (never auto-approves). `--watch` re-runs on every new commit; `--fast` skips the `docs` agent (immediate review only — watchers always run the full panel).
- **`/facets:pr-fix <PR>`** — read unresolved review comments, classify, apply confidence-gated fixes, push, reply, resolve. `--watch` runs a 5-minute cron fix loop (don't pair it with a `pr-review-gh --watch` on the same PR — the two watchers re-trigger each other).

**PR / workflow authoring**

A **TIB** (Technical Implementation Brief — a lightweight ADR/RFC) captures the decision; one or more **TIP**s (Technical Implementation Plan) spell out how to build it.

- **`/facets:pr-create`** — open a draft PR from the current diff. Derives branch name, title, body, and label without asking.
- **`/facets:convert-tib-to-linear <doc> [project]`** — convert a TIB / ADR / RFC into a Linear project plan (milestones + issues with dependencies).
- **`/facets:tib-create <title>`** — scaffold a new TIB markdown file from the template; pre-fills date, author, and CalVer ID.
- **`/facets:tip-create <title> [--tib <path>]…`** — scaffold a TIP (Technical Implementation Plan): the mutable, concrete companion to a TIB. Optionally seeded from one or more TIBs; auto-maintains `Sibling TIP(s)` back-links across TIPs that share a parent TIB.
- **`/facets:tib-ship <tib-path>`** — yolo execute a TIB end-to-end: scaffold TIPs, branch, implement, then `review → fix → re-review` until clean (max 5 iterations). Runs the `runtime-validation` persona if UI surfaces changed. Stops with a ready-to-push branch; does not push or open a PR.

**Conventions**

- **`/facets:ts-conventions [--preview]`** — write/refresh structured coding conventions in the global `~/.claude/CLAUDE.md`, inside idempotent managed markers. Two sections: a **language-agnostic `## Engineering principles`** part in three altitude tiers — system/solution architecture (public-API contract, layering, package boundaries, security & trust boundaries, supply chain, observability, change management), application architecture, and module/code design — plus anti-patterns, written for any repo; and a **`## TypeScript conventions`** part (preferred stack, frontend stack, type system & strictness incl. no-`any`/no-cast/no-`enum` with per-rule lint enforcement, modules & exports, tests, React/Next, web3) written when a TS stack is detected and tailored to the repo's linter/test runner. Writes only to the global config — never a project file; a repo's own conventions always win. `--preview` prints the block without writing. The local review/ship flows nudge you to run it when a TS repo has no conventions doc.

**dApp testing** (TypeScript; Reown AppKit / wagmi)

- **`/facets:inject-wallet`** — boot a dev server + browser and inject a test wallet (an EIP-1193 provider announced over EIP-6963) so the agent gets past the Reown AppKit connect modal, then screenshot the connected UI. Backed by a local Anvil fork or a read-only RPC; reads/signing/sends proxy to the backend, so there is no in-browser crypto. Best-effort modal auto-connect with an `agent-browser` snapshot fallback, plus an env-gated wagmi `mock`-connector path for SIWE-heavy apps. Needs Node ≥ 22.18 and `agent-browser`.

**Utility**

- **`/facets:feedback <note>`** — log a facets improvement idea from whatever repo you're working in, as a GitHub issue on the facets repo (or appended to a local backlog with `--local`). Grounds the note in the current repo/branch/PR, scrubs sensitive detail when the working repo is private, and previews before posting. Target repo defaults to `0xbulma/facets` (override with `--repo` or `FACETS_REPO`).
- **`/facets:implement-feedback <issue>`** — the counterpart to `feedback`: pick up a logged improvement (a feedback issue, or `--local` backlog entry), implement it in the facets plugin to the repo's conventions (version bumps, cross-file invariants, tests), validate, and open a draft PR that closes the issue. `--goal` runs the full review→fix→re-review loop before the PR. Runs only inside a facets clone (mirrors `pr-switch`'s cross-repo guard); shares the `skill-authoring` rubric so what it writes is what passes review.
- **`/facets:setup`** — manually install the rubric prereqs (also runs in the background on every session start).

## Rubric prereqs (auto-installed)

17 external skills (16 [Vercel-published](https://vercel.com/docs/agent-resources/skills), 1 community) are installed automatically on first session after plugin install via a `SessionStart` hook. Idempotent — re-runs skip already-installed skills.

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
| `agent-browser` | `vercel-labs/agent-browser` | Browser automation | utility |
| `find-skills` | `vercel-labs/skills` | Skill discovery | utility |
| `before-and-after` | `vercel-labs/before-and-after` | Visual before/after diff | utility |

If any are missing at review time, the consuming persona logs a degradation warning and falls back to its inline rubric — no hard failure. Manual install: run `/facets:setup` from Claude Code, or invoke `bin/install-prereqs.sh` directly.

### Why not plugin `dependencies`?

Claude Code's `plugin.json` `dependencies` field only resolves other **plugins** (in the marketplace ecosystem). The 17 rubric skills above live in the parallel [skills.sh](https://skills.sh) / `npx skills` ecosystem, so we install them via SessionStart hook + a verbose `/facets:setup` skill instead.

## Other prerequisites

- `gh` CLI authenticated (`gh auth status`) — for the GitHub PR skills.
- `git` ≥ 2.30 — for `--name-status --find-renames`.
- **Node ≥ 22.18** — the review skills' bundled helpers (`build-changed-lines.ts`, `validate-findings.ts`, `findings-ledger.ts`) run via Node's native TypeScript type-stripping; `npx` (Node) also drives the prereq installer.

## Install

From inside Claude Code:

```
# 1. Add the marketplace (one-time)
/plugin marketplace add 0xbulma/facets

# 2. Install the plugin (one-time)
/plugin install facets@facets

# 3. Reload so the plugin and its commands (incl. /facets:setup) load
/reload-plugins

# 4. Install the 17 rubric dependencies and verify — one ✓ per skill (required)
/facets:setup
#    Runs bin/install-prereqs.sh: fetches each missing skill via `npx skills add`.
#    First run ~30-90s; re-runs skip already-installed skills (idempotent).
#    (A brand-new Claude Code session also runs this in the background via the
#     SessionStart hook, best-effort — but this explicit run is the guaranteed install.)
```

Make sure `npx` (Node.js), `gh` (authenticated), and `git` ≥ 2.30 are on `PATH` before step 1 — see [Prerequisites](#other-prerequisites) below.

### Local-only (without publishing)

Test the plugin straight from a clone, no marketplace round-trip:

```bash
claude --plugin-dir ./plugins/facets
```

The SessionStart hook fires the same way; the 17 rubric skills auto-install on session start.

## Update

```
/plugin marketplace update facets
```

The plugin's `version` field in `plugins/facets/.claude-plugin/plugin.json` controls when users see a new release. Each `SKILL.md` and persona also has its own `version:` field for per-file change tracking.

## Local development

After editing any file under `plugins/facets/`, run `/reload-plugins` inside Claude Code to pick up changes — no restart needed. Run `bats test/` (manifest, frontmatter, version fields, hook wiring, agent inventory, trigger-flag wiring, references/ backlinks) and `pnpm verify` (Biome + tsc + Vitest — covers the changed-lines builder, finding validator, and findings-ledger merge) to validate.

See [CLAUDE.md](./CLAUDE.md) for the full mental model, persona contract, versioning rules, and forking notes.

## Agents

6 baseline (always fire):

- `correctness` — type discipline, code smells, naming, security primitives.
- `error-handling` — swallowed errors, missing error states, dead code paths.
- `docs` — JSDoc/TSDoc on exports, Markdown accuracy, pointer integrity.
- `tests` — missing tests, layout enforcement.
- `simplification` — unnecessary complexity, redundant logic, over-engineering.
- `performance` — barrel imports, memory leaks, N+1, memoization correctness.

11 conditional (fire only when their flag matches the diff):

- `react-next` — `<HAS_REACT>` — Server Components, hooks, React 19 APIs, Next.js conventions, Cache Components. Loads `vercel-react-best-practices`, `vercel-composition-patterns`, `next-best-practices`, `next-cache-components`, `building-components` (+ `vercel-react-native-skills` when RN code detected).
- `styling` — `<HAS_TAILWIND> OR <HAS_STYLING>` — Tailwind, design tokens, styling-architecture consistency. Loads `tailwind-design-system`, `web-design-guidelines`, `building-components` (+ `ai-elements`/`streamdown` when their imports are present).
- `accessibility` — `<HAS_STYLING> OR <HAS_REACT>` — ARIA, keyboard nav, focus management, alt text, label association. Loads `web-design-guidelines`, `building-components`.
- `ai-sdk` — `<HAS_AI_SDK>` — Vercel AI SDK usage, streaming, tool calls, structured output, useChat. Loads `ai-sdk`, `ai-elements`, `streamdown`.
- `api-security` — `<HAS_SERVER_API>` — authn/authz on routes and server actions, boundary input validation, webhook signature verification, SSRF, server-held signing keys.
- `web3` — `<HAS_WEB3>` — contract calls, permits, chainId validation, signature handling, vendored `.sol` diffs.
- `ci-security` — `<HAS_WORKFLOWS>` — workflow injection, action pinning, `permissions:` scopes, secret exposure. Uses the in-repo `references/github-actions.md` hardening rubric; loads `turborepo`.
- `release-integrity` — `<HAS_RELEASE>` — publish flow, provenance, release-commit signing, Changesets wiring. Loads `deploy-to-vercel`, `vercel-cli-with-tokens`.
- `dependencies` — `<HAS_DEPS>` — lockfile drift, `.npmrc` hygiene, typosquats, postinstall scripts.
- `runtime-validation` — `<HAS_ROUTE_UI>` — boots the dev server, navigates the changed route(s), captures console errors / network 4xx-5xx / screenshots. Loads `agent-browser`; `tib-ship` excludes it from its iteration loop and runs it once after static convergence.
- `skill-authoring` — `<HAS_PLUGIN_SKILLS>` — Claude Code skill/plugin authoring conformance: required version bumps, the frontmatter contract, name-matches-directory, no XML brackets in frontmatter, `disable-model-invocation`, and the cross-file inventory invariants. Grades against the in-repo `references/skill-authoring.md` rubric layered with the repo's own conventions; shared with the `implement-feedback` skill.

## License

MIT — fork, adapt, re-use freely. See [LICENSE](./LICENSE).
