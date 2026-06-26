# facets

Fourteen user-invokable slash-command skills + one engine skill (`pr-review-engine`, invoked by other skills, not directly).

**PR navigation / review / fix** (review side delegates to the shared `pr-review-engine` skill + its 17-agent library)

- **`/facets:pr-switch <pr-url-or-num>`** — switch the local checkout to a PR's head branch. Accepts a full GitHub PR URL, `owner/repo#num` shorthand, or a bare number. Refuses cross-repo URLs; resolves a dirty tree interactively (stash/commit/discard/abort).
- **`/facets:pr-review-local`** — pre-PR review on the local branch (committed + uncommitted). Terminal-only output. `--fix` applies mechanical fixes; `--goal` loops fix→re-review and, on converge, pushes the committed fixes to the branch's existing open PR (does nothing if there is none); `--fast` skips the `docs` agent.
- **`/facets:pr-review-gh <PR>`** — review an open GitHub PR; posts findings as a `COMMENT` review (never auto-approves). `--watch` re-reviews on every new commit; `--fast` skips the `docs` agent (immediate review only).
- **`/facets:pr-fix <PR>`** — read unresolved review comments, classify, apply confidence-gated fixes, push, reply, resolve. `--watch` runs a cron-driven fix loop.

**PR / workflow authoring** (repo-agnostic; no persona library)

- **`/facets:pr-create`** — open a draft PR from the current diff. Branch, title, body, and label derived without asking.
- **`/facets:convert-tib-to-linear <doc> [project]`** — convert a TIB / ADR / RFC into a Linear project plan with milestones and dependency-aware issues.
- **`/facets:tib-create <title>`** — scaffold a new TIB markdown file from the template; pre-fills date, author, and CalVer ID.
- **`/facets:tip-create <title> [--tib <path>]…`** — scaffold a TIP (Technical Implementation Plan): the mutable, concrete companion to a TIB. Optionally seeded from one or more TIBs; auto-maintains `Sibling TIP(s)` back-links across TIPs that share a parent TIB.
- **`/facets:tib-ship <tib-path>`** — yolo execute a TIB end-to-end: scaffold TIPs, branch, implement, then `review → fix → re-review` until clean (max 5 iterations). Runs the `runtime-validation` persona if UI surfaces changed. Stops with a ready-to-push branch; the user pushes and opens the PR manually.

**dApp testing** (TypeScript; Reown AppKit / wagmi)

- **`/facets:inject-wallet`** — boot a dev server + browser, inject a test wallet (EIP-1193 + EIP-6963) so the agent gets past the Reown AppKit connect modal, then screenshot the connected UI. Anvil-fork or read-only-RPC backend; env-gated wagmi `mock`-connector fallback. Needs Node ≥ 22.18 and `agent-browser`.

**Utility**

- **`/facets:feedback <note>`** — capture a facets improvement idea from whatever repo you're in, as a GitHub issue on the facets repo (or `--local` to append to a backlog file). Grounds the note in the current repo/branch/PR, scrubs sensitive detail for private repos, and previews before posting. Target defaults to `0xbulma/facets` (override via `--repo` / `FACETS_REPO`). Captures feedback only — never edits facets or opens PRs.
- **`/facets:implement-feedback <issue>`** — the counterpart to `feedback`: pick up a logged improvement (a feedback issue, or `--local` backlog entry) and implement it in the facets plugin to the repo's conventions (version bumps, cross-file invariants, tests), then open a draft PR that closes the issue. `--goal` runs the full review→fix→re-review loop before the PR. Must run inside a facets clone (mirrors `pr-switch`'s cross-repo guard).
- **`/facets:setup`** — manually install the 17 rubric skills used by the conditional review personas. Same script also runs in the background on every Claude Code session start.

The PR review/fix skills delegate Steps 3–6 to `skills/pr-review-engine/SKILL.md`, which walks `skills/pr-review-engine/agents/*.md` and dispatches one sub-agent per matching file in parallel. Baseline agents always fire; conditional agents fire when their trigger flag matches the diff (Web3, React/Next, Tailwind/styling, CI/release). Shared rubric content lives in `skills/pr-review-engine/references/` and is loaded on demand by agents that cite it.

## Prerequisites

- `gh` CLI authenticated (`gh auth status`) — for the GitHub skills.
- `git` ≥ 2.30.

17 rubric skills (from the [skills.sh](https://skills.sh) registry: 16 Vercel-published + 1 community) are *auto-installed* by the `SessionStart` hook the first time the plugin is loaded. See the root `README.md` / `CLAUDE.md` for the full inventory and per-agent attribution. When a skill is absent at review time, the consuming agent logs a degradation message and falls back to its inline rubric — no hard failure.

## Install (as a marketplace plugin)

```
/plugin marketplace add 0xbulma/facets
/plugin install facets@facets
```

## Local development

```bash
claude --plugin-dir ./plugins/facets
```

Inside Claude Code, `/reload-plugins` picks up edits without restart.

See the repo-level `CLAUDE.md` for the full mental model.
