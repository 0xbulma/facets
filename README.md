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

> **F**ullstack&nbsp;·&nbsp;**A**gentic&nbsp;·&nbsp;**C**ode&nbsp;·&nbsp;**E**ngine&nbsp;·&nbsp;**T**ypeScript&nbsp;·&nbsp;**S**hipping
>
> **Self-review every _facet_ of your PR — then ship it.** Full workflow suite on Codex and Claude Code.

Facets ships a compact Codex plugin and a Claude Code [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces). Both cover review/fix, GitHub PRs, TIB/TIP planning and shipping, conventions, wallet testing, setup, and feedback. Codex uses one small router plus on-demand references; Claude exposes fourteen skills plus a 17-agent engine.

Both work on any project. Their conditional review rubrics are tuned for TS/JS/JSX/TSX, React/Vercel, Tailwind, AI SDK, and Web3 code.

## Quick install

**Codex:**

```bash
codex plugin marketplace add 0xbulma/facets
codex plugin add facets@facets
```

Start a new thread, then ask: `$facets review my changes`, `$facets pr-create`, `$facets tib-create`, `$facets inject-wallet`, or any route below.

**Claude Code:**

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
├── AGENTS.md                                # Codex pointer to shared repo guidance
├── .codex-plugin/plugin.json              # Codex plugin manifest
├── .agents/plugins/marketplace.json       # Codex marketplace entry
├── skills/facets/                          # compact full-suite Codex router
│   ├── SKILL.md
│   ├── references/                         # seven on-demand workflow contracts
│   └── agents/openai.yaml                  # Codex UI metadata
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
│   │       └── scripts/                   # deterministic helpers, TypeScript run via node (changed-lines, finding validation, findings-ledger merge, git-scope helpers, goal-loop stop conditions, coupled-partner sweep)
│   ├── hooks/hooks.json                   # SessionStart auto-install
│   ├── bin/install-prereqs.sh             # idempotent prereq installer
│   └── README.md
├── CLAUDE.md                              # guidance for Claude Code working in this repo
└── test/                                  # bats suite (manifest, frontmatter); TS script tests run via pnpm verify
```

## Skills

Every route below is available as `$facets <route>` in Codex and `/facets:<route>` in Claude Code. Codex loads the same bundled persona rubrics on demand and launches one independent reviewer per selected persona, keeping at most three in flight at once to fit its agent slots and starting the next as soon as any reviewer returns.

**PR navigation / review / fix**

- **`/facets:pr-switch <pr-url-or-num>`** — switch the local checkout to a PR's head branch. Accepts a full GitHub PR URL, `owner/repo#num` shorthand, or a bare number. Refuses cross-repo URLs; resolves a dirty tree interactively (stash/commit/discard/abort).
- **`/facets:pr-review-local [base] [--fast] [--fix|--goal] [--max-iters N] [--no-runtime]`** — pre-PR review on the working tree (committed + uncommitted). Terminal output. `--fix` applies mechanical fixes once (unstaged); `--goal` loops review→fix→re-review, committing each iteration, until no critical/high/medium findings remain, then pushes the converged commits to the branch's existing open PR (does nothing if there is none).
- **`/facets:pr-review-gh <PR>`** — review an open GitHub PR (diff computed locally, never via the GitHub API). Posts findings as a `COMMENT` review (never auto-approves). `--watch` re-runs on every new commit; `--fast` skips the `docs` agent (immediate review only — watchers always run the full panel).
- **`/facets:pr-fix <PR>`** — read unresolved review comments, classify, apply confidence-gated fixes, push, reply, resolve. `--watch` runs a 5-minute cron fix loop (don't pair it with a `pr-review-gh --watch` on the same PR — the two watchers re-trigger each other).

**PR / workflow authoring**

A **TIB** (Technical Implementation Brief — a lightweight ADR/RFC) captures the decision; one or more **TIP**s (Technical Implementation Plan) spell out how to build it.

- **`/facets:pr-create`** — open a draft PR from the current diff. Derives branch name, title, body, and label without asking.
- **`/facets:convert-tib-to-linear <doc> [project]`** — convert a TIB / ADR / RFC into a Linear project plan (milestones + issues with dependencies).
- **`/facets:tib-create <title>`** — scaffold a new TIB markdown file from the template; pre-fills date, author, and CalVer ID.
- **`/facets:tip-create <title> [--tib <path>]… [--dir <path>]`** — scaffold a TIP (Technical Implementation Plan): the mutable, concrete companion to a TIB. Optionally seeded from one or more TIBs; auto-maintains `Sibling TIP(s)` back-links across TIPs that share a parent TIB.
- **`/facets:tib-ship <tib-path> [--phase <name>]… [--max-iters N] [--no-runtime]`** — execute a TIB end-to-end: scaffold TIPs, branch, implement, then `review → fix → re-review` until clean. Runs `runtime-validation` if UI surfaces changed. Stops with a ready-to-push branch; does not push or open a PR.

**Conventions**

- **`/facets:ts-conventions [--preview]`** — write/refresh managed global engineering + TypeScript conventions (`~/.codex/AGENTS.md` for Codex; `~/.claude/CLAUDE.md` for Claude), tailored to the detected stack. Project rules always win; `--preview` writes nothing.

**dApp testing** (TypeScript; Reown AppKit / wagmi)

- **`/facets:inject-wallet [--anvil [--fork-url <rpc>] | --rpc <url> | --mode mock]`** — boot a dev server + browser and inject a test wallet so the agent gets past the Reown AppKit connect modal and screenshots the connected UI. Anvil supports test signing/sends; existing-RPC mode is read-only. Needs Node ≥ 22.18 and `agent-browser`.

**Utility**

- **`/facets:feedback [note] [--repo owner/repo] [--local|--list]`** — log a facets improvement idea from any repo as a GitHub issue or local backlog entry. Grounds the note in context, scrubs private details, and previews before posting.
- **`/facets:implement-feedback [issue] [--repo owner/repo|--local] [--goal] [--max-iters N] [--no-runtime]`** — implement a feedback issue/backlog entry inside a Facets clone, validate it, and open a draft PR. `--goal` runs the full review/fix loop first; the shared `skill-authoring` rubric governs both hosts.
- **`/facets:setup`** — install optional rubric prereqs. Claude also checks them in the background; Codex keeps setup explicit to avoid loading 17 extra skill descriptions by default.

## Rubric prereqs

17 external skills (16 [Vercel-published](https://vercel.com/docs/agent-resources/skills), 1 community) deepen conditional reviews. Claude has a best-effort `SessionStart` hook; Codex installs them only through explicit `$facets setup` to keep default context lean. Setup is idempotent and optional because both plugins bundle fallback rubrics.

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

If any are missing, review falls back to its bundled rubric—no hard failure.

### Why not plugin `dependencies`?

Claude Code's `plugin.json` `dependencies` field only resolves other **plugins** (in the marketplace ecosystem). The 17 rubric skills above live in the parallel [skills.sh](https://skills.sh) / `npx skills` ecosystem, so we install them via SessionStart hook + a verbose `/facets:setup` skill instead.

## Other prerequisites

- `gh` CLI authenticated (`gh auth status`) — for the GitHub PR skills.
- `git` ≥ 2.30 — for `--name-status --find-renames`.
- **Node ≥ 22.18** — the review skills' bundled helpers (`build-changed-lines.ts`, `validate-findings.ts`, `findings-ledger.ts`, `review-scope.ts`, `goal-loop.ts`, `couple-sweep.ts`) run via Node's native TypeScript type-stripping; `npx` (Node) also drives the prereq installer.

## Install

From inside Claude Code:

```
# 1. Add the marketplace (one-time)
/plugin marketplace add 0xbulma/facets

# 2. Install the plugin (one-time)
/plugin install facets@facets

# 3. Reload so the plugin and its commands (incl. /facets:setup) load
/reload-plugins

# 4. Optionally install the 17 rubric dependencies and verify — one ✓ per skill
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

**Codex:**

```bash
codex plugin marketplace upgrade facets
# Start a new thread so refreshed skills are loaded.
```

**Claude Code:**

```
/plugin marketplace update facets
```

Codex updates key off `.codex-plugin/plugin.json`; Claude updates key off `plugins/facets/.claude-plugin/plugin.json`. See [CLAUDE.md](./CLAUDE.md#versioning) for version rules.

## Local development

After Claude edits, run `/reload-plugins`. For Codex worktree testing, use a separate local marketplace snapshot—the checked-in marketplace intentionally targets remote `main`—reinstall the cache-busted local plugin, then start a new thread. Run `bats test/` and `pnpm verify` for both hosts.

See [AGENTS.md](./AGENTS.md) and [CLAUDE.md](./CLAUDE.md) for the shared mental model, persona contract, versioning rules, and forking notes.

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
- `skill-authoring` — `<HAS_PLUGIN_SKILLS>` — dual-host Claude Code/Codex skill and plugin conformance: platform-specific manifests, version/frontmatter and invocation rules, package paths, conditional-trigger parity, and derived inventories. Grades against the shared in-repo `references/skill-authoring.md` rubric.

## License

MIT — fork, adapt, re-use freely. See [LICENSE](./LICENSE).
