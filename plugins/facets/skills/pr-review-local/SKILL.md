---
name: pr-review-local
version: 2.6.0
description: Pre-PR local code review. Reviews local branch changes (committed + uncommitted) using parallel specialized agents (6 baseline + conditional Web3, React/Next, styling, accessibility, AI-SDK, API-security, CI-security, release-integrity, dependencies, route-UI) and outputs findings in the terminal. Optionally applies fixes with --fix (refuses on dirty tree), or loops review/fix/re-review with --goal (commits each iteration) until no critical/high/medium findings remain. Use when user says /facets:pr-review-local, "review my changes", "review before PR", "local review", "deep review", or "review and fix until clean".
---

# review-local — Pre-PR Local Review

Reviews local branch changes using parallel specialized agents from `${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/SKILL.md` and outputs findings directly in the terminal. Zero GitHub interaction. Optionally applies fixes with `--fix`, or loops review→fix→re-review with `--goal` until the review passes cleanly.

## Usage

```
/facets:pr-review-local                        # review current branch vs default base
/facets:pr-review-local <BASE_BRANCH>          # review against an explicit base branch
/facets:pr-review-local --fix                  # review and apply fixes once (unstaged; refuses on dirty tree)
/facets:pr-review-local --goal                 # loop review->fix->re-review, commit each iteration, until clean
/facets:pr-review-local --goal --max-iters 8   # raise the loop ceiling (default 5)
/facets:pr-review-local --goal --no-runtime    # skip the post-convergence runtime-validation shot
/facets:pr-review-local --fast                 # skip the docs agent (cheapest meaningful cut)
/facets:pr-review-local <BASE_BRANCH> --fix    # flags combine freely
```

`<BASE_BRANCH>` is positional and must NOT begin with `--`. Flag order is otherwise free.

`--fast` excludes the `docs` agent via the engine's `EXCLUDE_AGENTS` input. Dogfood data across four full review passes: `docs` is the most expensive agent per launch (deep cross-reference verification) and the most likely to return clean on code-focused diffs — it's the one cut that saves real cost without touching the bug-finding lenses. Use the default (full panel) when the diff touches Markdown, inventories, or public API docs.

`--goal` is the autonomous loop mode: it reviews, fixes `critical`/`high`/`medium` findings, re-gates (format → lint → typecheck → test), commits, and re-reviews until no actionable findings remain — see the **Goal mode** section. It commits each iteration and therefore refuses on a dirty tree. `--goal` supersedes `--fix` (loop-and-commit beats single-shot-unstaged); if both are passed, `--goal` wins.

## Pre-conditions

- The skill is local-only by design. If `CI=true` or `GITHUB_ACTIONS=true` is detected, print one warning line — `WARNING: local:pr-review-local is for pre-PR local review; this skill family does not ship a CI variant.` — and continue. Do not refuse.

## Validating end-to-end

A maintainer changing this skill should verify each outcome shape:

| Scenario | Expected last line |
|---|---|
| Clean branch, no findings | `Sentinel: REVIEW_CLEAN — no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| Findings present | `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| Findings + agent crash | `Sentinel: REVIEW_DONE_LOCAL — ...` (with a `WARNING: <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>) — review may be incomplete.` line prepended to the findings output) |
| Zero findings + agent crash | `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.` |
| `--fix` happy path | `Sentinel: FIX_DONE_LOCAL — <X> applied, <Y> skipped (Local-only, unstaged).` plus `git diff` shows the unstaged edits. |
| `--fix` aborted on dirty tree | `Sentinel: FIX_ABORTED — working tree is not clean. Commit or stash before --fix.` |
| `--goal` converges | `Sentinel: GOAL_CLEAN — review passes cleanly after <i> iteration(s) on <HEAD_BRANCH> vs <BASE_BRANCH>; <K> low finding(s) triaged (not auto-fixed).` plus one `fix(review): iteration N` commit per fixing pass. |
| `--goal` on already-clean branch | `Sentinel: GOAL_CLEAN — ... after 1 iteration(s) ...` (idempotent: no commits made). |
| `--goal` aborted on dirty tree | `Sentinel: GOAL_ABORTED — working tree is not clean; commit or stash before --goal.` |
| `--goal` aborted on detached HEAD | `Sentinel: GOAL_ABORTED — detached HEAD; check out a branch before --goal.` |
| `--goal` aborted on red base gate | `Sentinel: GOAL_ABORTED — base gate is red (<TEST_CMD> fails before any fix); fix it or run without --goal.` |
| `--goal` same findings twice | `Sentinel: GOAL_STUCK — identical findings on iteration <i> and <i-1>; stopping for user input.` |
| `--goal` hits the ceiling | `Sentinel: GOAL_MAXED — <N> actionable finding(s) remain after <MAX_ITERS> iteration(s); extend, accept, or stop?` |
| `--goal` runtime fix pass failed | `Sentinel: GOAL_RUNTIME_RED — runtime fix pass failed (static gate or re-validation still red); stopping for user input.` |
| Re-run, input unchanged (cache hit) | cached findings reprinted under a `(cached — input unchanged since <head_sha>)` header + a reuse/re-review prompt; on *reuse*, the matching `REVIEW_*` sentinel from the cached counts (Step 2c — single-shot only) |

Idempotency: re-running with an unchanged input (same merge-base + head SHA + worktree) short-circuits via the Step 2c cache and reprints the cached findings + sentinel without re-running agents; finding *text* never drifts on a cache hit because nothing is recomputed. A genuine change (any of the three) misses the cache and runs a fresh review.

## Step 1: Validate environment + arguments

```bash
if [ "${CI:-}" = "true" ] || [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "WARNING: local:pr-review-local is for pre-PR local review; this skill family does not ship a CI variant." >&2
fi
```

Parse positional and flag args:

- If `--fix` is present, set `FIX=1`.
- If `--goal` is present, set `GOAL=1` (autonomous loop mode — see the **Goal mode** section). `--goal` supersedes `--fix`: if both are present, set `GOAL=1` and ignore `FIX` (loop-and-commit replaces single-shot-unstaged).
- If `--max-iters <N>` is present, set `MAX_ITERS=<N>`; otherwise default `MAX_ITERS=5`. Only meaningful with `--goal`.
- If `--no-runtime` is present, set `NO_RUNTIME=1`. Only meaningful with `--goal`.
- If `--fast` is present, set `FAST=1`.
- If a non-flag positional argument is present and does not start with `--`, treat it as `<BASE_BRANCH>`. (The numeric value following `--max-iters` is its argument, not the positional base branch.)

## Step 2: Resolve branches

```bash
# Fetch refs. If SSH auth fails (e.g. the ssh-agent / 1Password agent is down),
# retry the SAME fetch over HTTPS. Use `git -c remote.origin.url=…` (NOT a bare
# `git fetch <url>`, which only moves FETCH_HEAD) so origin's refspec runs and
# refs/remotes/origin/* actually update — every step below reads origin/<BASE>.
# Still git-only (no `gh`), so the zero-GitHub contract holds. Don't silence the
# SSH error; surface it, and stop loudly if HTTPS also fails (never review on
# stale refs).
if ! git fetch origin; then
  https_url=$(git remote get-url origin \
    | sed -E 's#^git@github\.com:#https://github.com/#; s#^ssh://git@github\.com/#https://github.com/#')
  echo "git fetch origin failed; retrying over HTTPS: $https_url" >&2
  git -c remote.origin.url="$https_url" fetch origin \
    || { echo "fetch failed over SSH and HTTPS — refs may be stale; fix auth/network before reviewing." >&2; exit 1; }
fi

HEAD_BRANCH=$(git branch --show-current)
if [ -z "$HEAD_BRANCH" ]; then
  HEAD_BRANCH=$(git rev-parse --short HEAD)   # detached HEAD — display only
fi
HEAD_SHA=$(git rev-parse HEAD)
```

Resolve `<BASE_BRANCH>`:

1. If a positional argument was provided, use it.
2. Otherwise auto-detect the repo's default branch:

```bash
BASE_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | sed 's/.*: //' | tr -d '[:space:]')
if [ -z "$BASE_BRANCH" ]; then
  for candidate in main master; do
    if git show-ref --verify --quiet "refs/remotes/origin/$candidate"; then
      BASE_BRANCH=$candidate
      break
    fi
  done
fi
if [ -z "$BASE_BRANCH" ]; then
  echo "Could not resolve base branch. Pass one explicitly: /facets:pr-review-local <BASE_BRANCH>" >&2
  exit 1
fi
```

Empty-diff short-circuit. Compute the actual commit-range diff before any review work, and stop only if it is empty AND the working tree is clean. Branch-name equality alone is NOT sufficient — a clean tree on `main` with unpushed commits ahead of `origin/main` still has changes to review:

```bash
MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> HEAD)
COMMIT_RANGE_FILES=$(git diff --name-only "$MERGE_BASE..HEAD")
WORKTREE_DIRTY=$(git status --porcelain)
if [ -z "$COMMIT_RANGE_FILES" ] && [ -z "$WORKTREE_DIRTY" ]; then
  echo "No changes to review on <HEAD_BRANCH> vs <BASE_BRANCH>"
  exit 0
fi
```

## Routing: goal mode vs single-shot

- If `GOAL=1` → **skip Steps 7 and 7b entirely** and follow the **Goal mode** section below. That section drives the engine (Steps 3–6) once per iteration and owns its own output. Do not also run the single-shot Step 7 output.
- Otherwise → **Step 2c (idempotency cache)**, then Steps 3–6 once, then Step 7 (and Step 7b if `FIX=1`).

## Step 2c: Idempotency cache (single-shot path; short-circuit unchanged re-runs)

Before fanning out the agent panel (~1M tokens), check whether the review input is byte-identical to the last recorded run — if so, reuse the cached findings instead of reproducing them (feedback #23). Goal mode skips this (it runs its own loop).

```bash
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')   # owner/repo
LEDGER_DIR=${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}
LEDGER="$LEDGER_DIR/${slug%%/*}-${slug##*/}-branch-$(printf '%s' "$HEAD_BRANCH" | tr '/ ' '-').json"
MERGE_BASE=$(git merge-base "origin/<BASE_BRANCH>" HEAD)
# Run identity = merge-base + head SHA (these pin the committed diff) + the
# CONTENT of the uncommitted overlay. Hash `git diff HEAD`, NOT
# `git status --porcelain`: porcelain is content-blind, so editing an
# already-modified file keeps the same status line and would falsely reuse
# stale findings against changed code. (shasum -a 256 is the macOS default;
# substitute sha256sum on Linux.)
RUN_HASH=$({ printf '%s\n%s\n' "$MERGE_BASE" "$HEAD_SHA"; git diff HEAD; } | shasum -a 256 | cut -d' ' -f1)

# Fail open: capture the result, and on any error fall through to a normal
# review — never skip the review on an unreadable cache result.
CACHE_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/scripts/findings-ledger.ts" \
  --ledger "$LEDGER" --check-cache --run-hash "$RUN_HASH") || CACHE_JSON=""
```

- **`cache_hit` true** → do NOT run Steps 3–6. Reprint the returned `findings` + `counts` as the Step 7 output, header marked `(cached — input unchanged since the last review of <head_sha>)`, then ask the user: **reuse this, or force a fresh review?** On *reuse* → emit the matching `REVIEW_*` sentinel from the cached counts and stop. On *force / re-review* → fall through to Steps 3–6 as a normal run. (No `--force` flag — the prompt is the bypass, keeping the flag surface flat.)
- **`cache_hit` false** → proceed to Steps 3–6 normally.
- **`CACHE_JSON` empty or missing a `cache_hit` field** (the check errored — old Node, bad path, etc.) → treat as a miss and proceed to Steps 3–6. The cache is an optimization; an unreadable result must never skip the review.

Carry `RUN_HASH` forward to Step 6b so the fresh run is recorded (`--run-hash`).

## Steps 3–6: Shared review base

**Read `${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/SKILL.md` and follow Steps 3–6 there**, with:

- `DIFF_SOURCE` = `local` (include uncommitted diff)
- `HEAD_REF` = `HEAD`
- `EXCLUDE_AGENTS` = `["docs"]` when `FAST=1`, otherwise empty
- `INTENT_CONTEXT` = changed-commit messages only, built locally:
  ```bash
  MERGE_BASE=$(git merge-base "origin/<BASE_BRANCH>" HEAD)
  git log --format='%h %s%n%b' "$MERGE_BASE..HEAD"
  ```
  This lets agents tell a deliberate, commit-documented change from a regression. **Built from `git` only — never `gh`** (the PR title/body lives behind GitHub and would break this skill's zero-GitHub contract; that richer `INTENT_CONTEXT` is `pr-review-gh`'s job). Empty when the branch has no commits beyond the merge-base (pure uncommitted-only review).

The base produces: `FINDINGS`, `DROPPED_FINDINGS`, `FAILED_AGENTS`, `COUNTS`, `DROPPED_COUNTS`, `TOTAL_AGENTS_LAUNCHED`.

## Step 6b: Findings ledger (stateful re-runs)

Re-running on an evolving branch shouldn't re-surface findings you've already seen or deliberately deferred. Merge this run's findings into a persisted ledger (feedback #19). This runs in the **single-shot path only** — goal mode tracks progress across its own iterations via `prev_findings_hash`, so it does not touch the ledger.

Write the Step 6 `FINDINGS` array (the kept findings) to `/tmp/facets-findings.json` as a JSON array, then merge it:

```bash
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')   # owner/repo
LEDGER_DIR=${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}
# Namespace the key with `branch-` so a branch literally named `pr5` can't collide
# with pr-review-gh's `pr5` PR ledger.
LEDGER="$LEDGER_DIR/${slug%%/*}-${slug##*/}-branch-$(printf '%s' "$HEAD_BRANCH" | tr '/ ' '-').json"

# --write persists the updated ledger; --run-hash (from Step 2c) records this
# run's input identity so the next unchanged re-run can short-circuit. If the
# merge fails (bad dir, disk), fall back to the plain stateless Step 7 output —
# never assume unpersisted state.
node "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/scripts/findings-ledger.ts" \
  --ledger "$LEDGER" --findings /tmp/facets-findings.json --head-sha "$HEAD_SHA" --run-hash "$RUN_HASH" --write \
  || echo "findings-ledger failed; continuing with the plain (stateless) Step 7 output." >&2
```

The merge prints `net_new` / `recurring` / `resolved` / `suppressed`. Feed them into Step 7:

- **Drop every `suppressed` (wontfix) finding from the displayed list** — that is the entire point of the manual wontfix mark.
- Tag each surfaced finding **NEW** (its id is in `net_new`) or **seen** (in `recurring`), and print the one-line ledger summary in Step 7.
- **If the merge command failed**, skip the ledger annotations entirely and emit the plain Step 7 output — do not invent NEW/seen tags from state that wasn't persisted.

This stays **git-only** (owner/repo from `git remote`, never `gh`) and the ledger lives **outside** the repo, so both the zero-GitHub and clean-tree contracts hold.

**Marking a finding wontfix:** set its `status` to `"wontfix"` in the ledger JSON by hand (no flag); future runs auto-suppress it.

## Step 7: Output to terminal

Format directly in the conversation:

```
## Local-only Code Review (local:pr-review-local)

**Branch:** <HEAD_BRANCH> -> <BASE_BRANCH>  |  **Files:** <count>  |  **Range:** <MERGE_BASE_SHORT>..<HEAD_SHA_SHORT>
**Uncommitted files included:** <U>  |  **Mode:** Local-only
**Ledger:** <net_new> new · <recurring> seen before · <resolved> resolved since last run · <suppressed> wontfix-suppressed

| Severity | Count |
|----------|-------|
| Critical | X     |
| High     | X     |
| Medium   | X     |
| Low      | X     |

### Critical (X)

- **[CRITICAL]** **[NEW]** <file_path>:L<line> — <description>
  _Suggestion: <how to fix>_

### High (X)

- **[HIGH]** <file_path>:L<line> — <description>
  _Suggestion: <how to fix>_

### Medium (X)
...
```

**Order findings by severity (Critical → High → Medium → Low), not by file.** Re-sort the `FINDINGS` list from Step 6 by severity DESC, then file path ASC, then line ASC, and group under one heading per severity bucket. Each finding shows its `<file_path>:L<line>` inline so the reader can jump to the source. Omit any severity heading whose bucket is empty.

**Ledger annotations (from Step 6b).** Drop every `suppressed` (wontfix) finding from these sections entirely. Prefix each finding that is in `net_new` with a `**[NEW]**` tag (findings in `recurring` carry no tag — they were seen in an earlier run). The `**Ledger:**` header line summarizes the four counts. When Step 6b did not run (no commits, or the ledger is unreadable), omit the `**Ledger:**` line and the `[NEW]` tags rather than guessing.

### Audit trail (dropped findings)

If `DROPPED_FINDINGS` is non-empty, after the severity sections print a one-line summary:

```
Audit: dropped <N> finding(s) by scope filter (<out_of_scope> file-level, <pre_existing> line-level, <doc_example> doc-example). Full list: /tmp/pr-review-local-dropped.json
```

Write the `DROPPED_FINDINGS` array to `/tmp/pr-review-local-dropped.json` (each entry tagged with `drop_reason` and, for line-level drops, `distance_to_nearest_changed_line`) so the user can `cat` it and re-introduce a finding if the filter was wrong. Skip both the line and the file entirely when zero findings were dropped.

### Sentinel lines

- Zero findings AND zero agent failures → `Sentinel: REVIEW_CLEAN — no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.`
- Zero findings BUT non-zero agent failures → `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.`
- Non-zero findings → `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` If `<FAILED_AGENTS>` is also non-zero, prepend a single `WARNING: <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>) — review may be incomplete.` line to the findings output BEFORE the sentinel.

When `FIX=1`: suppress the `REVIEW_DONE_LOCAL` sentinel (Step 7b will emit its own terminal sentinel). `REVIEW_CLEAN` / `REVIEW_INCOMPLETE` still print before falling through.

If `FIX=1`, proceed to **Step 7b**. Otherwise the skill is complete here.

## Step 7b: Apply fixes (only with --fix)

### Pre-condition: refuse on dirty tree

```bash
DIRTY=$(git status --porcelain)
if [ -n "$DIRTY" ]; then
  echo "Sentinel: FIX_ABORTED — working tree is not clean. Commit or stash before --fix." >&2
  echo "Pre-existing uncommitted file(s):" >&2
  printf '%s\n' "$DIRTY" >&2
  exit 1
fi
```

If the user wants to keep their work-in-progress, they `git stash push -u`, run `--fix`, then `git stash pop`. The skill stays out of stash management entirely.

### Apply fixes

**Batch by file** — process all findings on a given file as one unit, validate once, revert all-or-nothing. This avoids the silent-destruction bug where a per-finding revert (`git checkout -- <file>`) would wipe earlier successful fixes on the same file along with the failing one.

For each file with findings (files in any order; findings within a file ordered highest severity first):

1. Read the file from the local filesystem.
2. Apply EVERY finding for this file via the Edit tool, accumulating edits.
3. Validate the file once with the project linter. Auto-detect:
   - `biome.json` → `pnpm exec biome check <file>` (or `npx biome check <file>`)
   - `.oxlintrc.json` → `pnpm oxlint -c .oxlintrc.json <file>`
   - `.eslintrc*` → `npx eslint <file>`
   - `pyproject.toml` with ruff config → `ruff check <file>`
   - `Cargo.toml` → `cargo check` (cannot scope to a single file)
   - None of the above → skip linter validation

   **Package-manager pre-run-install guard.** `pnpm exec <tool>` (and `pnpm <script>`) can trigger pnpm's `verify-deps-before-run` → an implicit `pnpm install`, which fails in repos with a from-source native build (e.g. `sharp` / node-gyp) — aborting validation for a reason unrelated to the lint result. Avoid it: prefer the resolved binary directly (`./node_modules/.bin/<tool>`), or disable the pre-run check for the call (`pnpm --config.verify-deps-before-run=false exec <tool>` — the flag must precede `exec`, pnpm rejects it after — or env `npm_config_verify_deps_before_run=false`). If a pre-run install still fails, surface that one line and fall back to the direct binary — do **not** abort the whole `--fix` over a dependency-install failure that has nothing to do with the finding.
4. **All-or-nothing revert.** If lint passes, mark every finding for this file as `applied`. If lint fails, run `git checkout -- <file>` to revert the entire file (safe because the pre-condition guarantees the working tree was clean before the loop), and mark every finding for this file as `skipped: lint rejected the batch`. Do NOT report partial success — the user sees a consistent picture in `git diff`.
5. Track per-file outcomes: applied count, skipped count, skip reason.

### Report

```
## Fix Summary (Local-only)

Mode: Local-only (no PR, no commit, no push)
Fixed: X findings
Skipped: Y findings (see notes above)

Changes are unstaged. Review with: git diff
```

End with the sentinel:

```
Sentinel: FIX_DONE_LOCAL — <X> applied, <Y> skipped (Local-only, unstaged).
```

### Hard constraints

- Do NOT stage changes (`git add`).
- Do NOT commit.
- Do NOT push.
- Leave all changes as unstaged modifications so the user can review them with `git diff`.

## Goal mode (`--goal`): review → fix → re-review loop

Reached only when `GOAL=1` (the Routing section diverts here after Step 2 — Steps 7 and 7b do **not** run in goal mode). This is the autonomous-completion loop: review, fix the actionable findings, re-gate, commit, and re-review until the review passes cleanly. It is the same proven loop as `tib-ship` Step 5–6 (`${CLAUDE_PLUGIN_ROOT}/skills/tib-ship/SKILL.md`), operating on the branch's *existing* changes rather than freshly-scaffolded TIPs.

**"Passes cleanly" = no `critical`/`high`/`medium` findings remain.** `low` findings are never auto-fixed — they are carried to the final summary for the user to triage.

> **Autonomous, not careless.** Goal mode stops and asks the user on a stuck loop, an exhausted iteration budget, or a pre-existing red gate. It never commits broken state and never sweeps unrelated dirty changes into a commit.

### Command sniff (once)

Resolve `<FORMAT_CMD>` / `<LINT_CMD>` / `<TYPECHECK_CMD>` / `<TEST_CMD>` from `package.json` scripts with the biome/prettier fallback for format and the `<exec>` choice (`pnpm exec` / `yarn exec` / `npx` / `bunx`) by lockfile — the same logic as `tib-ship` Step 4. If a command is unresolvable (no `package.json`, no matching script, no formatter dep), skip that gate step with a one-line warning; never invent a command. Run this sniff **first** — the pre-flight gates below depend on `<TEST_CMD>`.

> **Package-manager pre-run-install guard (same as Step 7b).** When the resolved `<exec>` is `pnpm exec` or a `pnpm` script, pnpm's `verify-deps-before-run` can fire an implicit `pnpm install` that fails on a from-source native build and sinks an otherwise-green gate. Prefer the resolved binary (`./node_modules/.bin/<tool>`) or disable the check (`pnpm --config.verify-deps-before-run=false exec <tool>` — flag before `exec` — or env `npm_config_verify_deps_before_run=false`). A failed pre-run install is a tooling failure to surface — not a gate result, and not grounds to treat the iteration as red.

### Pre-flight gates (stop-and-ask)

Before the first iteration, check in order; every gate aborts with a `GOAL_ABORTED` sentinel and `exit 1` (so an automated wrapper — e.g. the native `/goal` audit — can tell an abort from a hang):

1. **Dirty working tree** — `git status --porcelain` non-empty:
   ```bash
   DIRTY=$(git status --porcelain)
   if [ -n "$DIRTY" ]; then
     echo "Sentinel: GOAL_ABORTED — working tree is not clean; commit or stash before --goal." >&2
     printf 'Uncommitted file(s):\n%s\n' "$DIRTY" >&2
     exit 1
   fi
   ```
   The loop commits each iteration, so uncommitted WIP must not be swept into a `fix(review)` commit. Committing the WIP first also brings it in-range so it gets reviewed. (Same clean-tree precondition as `--fix`; goal mode just emits `GOAL_ABORTED` instead of `FIX_ABORTED`.)
2. **Detached HEAD** — the loop needs a branch to commit onto, or the `fix(review)` commits are orphaned. Step 2 tolerates a detached HEAD for read-only review, but goal mode must refuse:
   ```bash
   if [ -z "$(git branch --show-current)" ]; then
     echo "Sentinel: GOAL_ABORTED — detached HEAD; check out a branch before --goal." >&2
     exit 1
   fi
   ```
3. **Pre-existing red gate** — run `<TEST_CMD>` once (resolved by the sniff above). If it already fails on the current branch, surface the failure and stop-and-ask — yolo must not paper over pre-existing breakage:
   - On **decline** → `echo "Sentinel: GOAL_ABORTED — base gate is red (<TEST_CMD> fails before any fix); fix it or run without --goal." >&2` and `exit 1`.
   - On **proceed** → record the failing test IDs as a *pre-existing baseline*. The re-gate (loop step 6) then treats the gate as green so long as it produces no failures beyond that baseline — otherwise the pre-existing red would never clear and the loop would run straight to `GOAL_MAXED`.

### The loop

`prev_findings_hash = ""`. For `i = 1..MAX_ITERS` (default `5` — a ceiling, not a target; expect convergence by iteration 2–3):

1. **Review.** Run Steps 3–6 (the engine) with `DIFF_SOURCE=local`, `HEAD_REF=HEAD`, `INTENT_CONTEXT` = the commit-messages-only block from the Steps 3–6 inputs above, and `EXCLUDE_AGENTS = ["runtime-validation"]` (also append `"docs"` when `FAST=1`). Excluding `runtime-validation` keeps the dev server from booting every iteration — it runs once after convergence (see below).
2. **Partition.** `actionable` = findings with severity in `{critical, high, medium}`; set the `low` findings aside as the triage list.
3. **Success check.** If `actionable` is empty → **break, success** (carry the lows forward to the summary).
4. **Stuck check.** Compute a stable hash of `actionable` (sort by `file`, `line`, `description`; hash). If `hash == prev_findings_hash` → identical findings two iterations running → restore the tree (see *Leaving the branch clean* below), then emit `Sentinel: GOAL_STUCK — identical findings on iteration <i> and <i-1>; stopping for user input.`, print the findings, and stop and ask the user (do not silently retry).
5. **Fix.** Apply fixes in order `critical → high → medium`, **batched by file** (reuse Step 7b's batch-by-file, all-or-nothing-per-file discipline). Apply the smallest change that addresses each finding's `description`. Skip any finding that is ambiguous or needs more than a localized edit (e.g. "refactor this module"); carry it to the next iteration — do not invent large changes.
6. **Re-gate.** Run `<FORMAT_CMD>` → `<LINT_CMD>` → `<TYPECHECK_CMD>` → `<TEST_CMD>`. Format may mutate files freely; the other three must end green (relative to the pre-existing baseline from pre-flight gate 3, if any). **If green** → commit (step 7). **If non-green** → do **not** commit; the failing gate output becomes additional synthetic findings for the next iteration. The fix edits stay uncommitted so the next iteration can build on them, but they are not a committed checkpoint — if the loop then terminates while still red, *Leaving the branch clean* (below) discards them.
7. **Commit** (only when the gate is green):
   ```
   fix(review): iteration <i> — <N> findings
   ```
8. Set `prev_findings_hash = hash`; continue.

If `i == MAX_ITERS` and `actionable` is still non-empty → restore the tree (see *Leaving the branch clean* below), then emit `Sentinel: GOAL_MAXED — <N> actionable finding(s) remain after <MAX_ITERS> iteration(s); extend, accept, or stop?`, print the residual findings, and ask the user whether to extend iterations, accept-and-continue, or stop.

### Leaving the branch clean on a non-success exit

Whenever goal mode stops **without** converging — `GOAL_STUCK`, `GOAL_MAXED`, or an aborted runtime re-pass — restore the working tree to the last committed state *before* printing the sentinel:

```bash
git checkout -- .   # discard the current iteration's uncommitted edits to tracked files
git clean -fd       # AND remove any untracked files/dirs a fix created (else gate 1 still trips)
```

This is safe because pre-flight gate 1 guaranteed a clean tree, so the only changes present are the loop's own edits — both modifications to tracked files (`git checkout`) and any new untracked files a fix introduced (`git clean -fd`; `git checkout` alone would leave these, and `git status --porcelain` counts them, so the next run would still `GOAL_ABORTED`). The stopping point is then the last green `fix(review)` commit (or the original `HEAD` if no iteration ever went green) — never a dirty, gate-red tree. Earlier iterations' work is preserved in their commits; the printed residual findings tell the user what remained.

### Post-convergence runtime check (single shot)

After the loop converges (success break), compute `<HAS_ROUTE_UI>` (engine Step 4). If `<HAS_ROUTE_UI>` is true AND `NO_RUNTIME` is unset, run the `runtime-validation` persona exactly once (mirrors `tib-ship` Step 6):

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/agents/runtime-validation.md`.
2. Launch a single Agent (subagent_type: `general-purpose`) with that persona body, the cumulative diff, the changed-files list, and the project's dev-server command.
3. If it returns any `critical`/`high` findings → run **one** dedicated runtime-fix pass — **not** a re-entry of the static loop, so the loop's `GOAL_STUCK` / `GOAL_MAXED` exits do not apply here. Apply the fixes, then **leave the work uncommitted until it is proven good on both gates** (so any failure is undone by the uncommitted-only restore — no committed runtime fix can be left behind):
   - Apply fixes for the runtime findings (`critical` → `high`, batched by file, same discipline as loop step 5). Do **not** commit yet.
   - Re-gate (`<FORMAT_CMD>` → `<LINT_CMD>` → `<TYPECHECK_CMD>` → `<TEST_CMD>`). **If non-green** (the runtime fix broke the static gate) → restore the tree (see *Leaving the branch clean* above) and emit `Sentinel: GOAL_RUNTIME_RED — runtime fix pass failed (static gate or re-validation still red); stopping for user input.`; do **not** re-run `runtime-validation`.
   - If the gate is green → re-run `runtime-validation` exactly once more (still uncommitted):
     - **If that re-run is clean** → commit `fix(review): runtime — <N> findings`, then fall through to the Final summary with `Runtime check: failed-then-fixed` (count this single runtime commit in `<M>`; `<i>` is unchanged — the static loop already converged).
     - **If still red** → restore the tree (see *Leaving the branch clean* above) and emit `Sentinel: GOAL_RUNTIME_RED — runtime fix pass failed (static gate or re-validation still red); stopping for user input.`, print the runtime findings, and stop and ask the user.

   `GOAL_RUNTIME_RED` is the terminal for either failure branch above — the third non-success exit the rollback rule covers, same restore-then-named-sentinel shape as `GOAL_STUCK` / `GOAL_MAXED`. Because the runtime fix is committed only after both gates pass, the restore (uncommitted-only) always fully undoes a failed runtime pass.

If `NO_RUNTIME` is set or `<HAS_ROUTE_UI>` is false, print a one-line note that runtime validation was skipped (and why).

### Final summary

On a clean converge, print a summary and the terminal sentinel:

```
## Goal-mode Review (local:pr-review-local --goal)

Branch:        <HEAD_BRANCH> -> <BASE_BRANCH>
Iterations:    <i> (clean on iteration <i>)
Commits:       <M> (fix(review): iteration N; plus one fix(review): runtime — N when Runtime check is failed-then-fixed)
Runtime check: passed | skipped (<reason>) | failed-then-fixed
Low findings:  <K> (not auto-fixed — listed below for manual triage)

Low findings (manual triage — omit when K=0):
  <file>:<line> — <description>
  ...

Sentinel: GOAL_CLEAN — review passes cleanly after <i> iteration(s) on <HEAD_BRANCH> vs <BASE_BRANCH>; <K> low finding(s) triaged (not auto-fixed).
```

### Hard constraints (goal mode)

- Commit each fixing iteration; never `git add`/commit a partial or gate-red state.
- Do NOT push and do NOT open a PR — the branch is left ready for the user.
- Never auto-fix `low` findings; only triage-list them.
- Commits are conventional (`fix(review): ...`) and signed if the repo configures signing.

## Notes

- **No GitHub interaction**. The skill never calls `gh api`. All output stays in the terminal.
- **Refuse on dirty tree** for both `--fix` and `--goal`. Clean precondition replaces ~80 lines of stash plumbing and a class of stash-pop-conflict bugs.
- **Pairs with `/facets:pr-review-gh`**: workflow is `/facets:pr-review-local` (pre-PR feedback) → fix issues → create PR → `/facets:pr-review-gh` (GitHub-posted review).
- **Pairing with native `/goal`**: `--goal` self-converges within `--max-iters` and is idempotent (an already-clean branch returns `GOAL_CLEAN` on iteration 1), so it does not require Claude Code's native `/goal` command. To go *unbounded* across the `GOAL_MAXED` bail (long-running, cross-session autonomy), wrap it: `/goal "run /facets:pr-review-local --goal until it prints GOAL_CLEAN"`. `GOAL_CLEAN` is the crisp completion token the native goal audit keys off.

## Sentinel grammar

| Sentinel | Owning step | Trailer grammar |
|---|---|---|
| `REVIEW_CLEAN` | Step 7 | `— no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| `REVIEW_INCOMPLETE` | Step 7 | `— <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.` |
| `REVIEW_DONE_LOCAL` | Step 7 | `— <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| `FIX_DONE_LOCAL` | Step 7b | `— <X> applied, <Y> skipped (Local-only, unstaged).` |
| `FIX_ABORTED` | Step 7b pre-flight | `— working tree is not clean. Commit or stash before --fix.` |
| `GOAL_CLEAN` | Goal mode final summary | `— review passes cleanly after <i> iteration(s) on <HEAD_BRANCH> vs <BASE_BRANCH>; <K> low finding(s) triaged (not auto-fixed).` |
| `GOAL_ABORTED` | Goal mode pre-flight (gate 1) | `— working tree is not clean; commit or stash before --goal.` |
| `GOAL_ABORTED` | Goal mode pre-flight (gate 2) | `— detached HEAD; check out a branch before --goal.` |
| `GOAL_ABORTED` | Goal mode pre-flight (gate 3) | `— base gate is red (<TEST_CMD> fails before any fix); fix it or run without --goal.` |
| `GOAL_STUCK` | Goal mode loop (stuck check) | `— identical findings on iteration <i> and <i-1>; stopping for user input.` |
| `GOAL_MAXED` | Goal mode loop (budget exhausted) | `— <N> actionable finding(s) remain after <MAX_ITERS> iteration(s); extend, accept, or stop?` |
| `GOAL_RUNTIME_RED` | Goal mode runtime re-pass | `— runtime fix pass failed (static gate or re-validation still red); stopping for user input.` |
