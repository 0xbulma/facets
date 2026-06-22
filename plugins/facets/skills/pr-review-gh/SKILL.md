---
name: pr-review-gh
version: 2.8.1
description: Local PR review bot. Reviews an open pull request with parallel specialized agents (6 baseline + conditional Web3, React/Next, styling, accessibility, AI-SDK, API-security, CI-security, release-integrity, dependencies, route-UI) and posts findings as inline GitHub review comments using event=COMMENT (never auto-approves). Optionally watches for new commits and re-reviews. Use when user says /facets:pr-review-gh, "review PR", "watch PR", or "babysit PR". Takes a PR number as argument.
---

# review-gh — Local PR Review (post to GitHub)

Reviews a GitHub Pull Request locally using parallel specialized agents from `${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/SKILL.md`, posts findings as inline review comments with `event="COMMENT"`. Never auto-approves or requests changes — leaves the verdict to humans. Optionally schedules a 5-minute watcher cron via `--watch`.

## Usage

```
/facets:pr-review-gh <PR_NUMBER>
/facets:pr-review-gh <PR_NUMBER> --watch
/facets:pr-review-gh <PR_NUMBER> --fast    # skip the docs agent (cheapest meaningful cut)
```

`--fast` excludes the `docs` agent via the engine's `EXCLUDE_AGENTS` input (most expensive agent per launch, most likely clean on code-focused diffs — see pr-review-local's usage notes for the dogfood data). `--fast` applies to the immediate review only; a `--watch` watcher always runs the full panel, since unattended re-reviews favor coverage over cost.

## Pre-conditions

- A `<PR_NUMBER>` is required.
- The skill is local-only by design. If `CI=true` or `GITHUB_ACTIONS=true` is detected, print one warning line — `WARNING: local:pr-review-gh runs locally; this skill family does not ship a CI variant. Use the repo-level pr-review-ci instead if you need CI verdicts.` — and continue. Do not refuse.
- If `--watch` is passed, the skill is NOT complete until Step 9's CronCreate succeeds and the job ID is reported.

## Placeholder convention

| Placeholder | Source | Description |
|---|---|---|
| `<OWNER>` | parsed from git remote | GitHub repo owner |
| `<REPO>` | parsed from git remote | GitHub repo name |
| `<PR_NUMBER>` | user argument | Pull request number |
| `<BASE_BRANCH>` | `gh pr view` → `baseRefName` | PR base branch |
| `<HEAD_BRANCH>` | `gh pr view` → `headRefName` | PR head branch |
| `<HEAD_SHA>` | `gh pr view` → `headRefOid` | Head commit full SHA |
| `<HEAD_SHA_SHORT>` | first 7 chars of `<HEAD_SHA>` | Head commit short SHA |
| `<REPO_PATH>` | `git rev-parse --show-toplevel` | Absolute path to repo root |
| `<BOT_LOGIN>` | `gh api user --jq '.login'` | Current GitHub user's login (only needed for `--watch`) |

## Step 1: Validate environment + arguments

```bash
if [ -z "${1:-}" ]; then
  echo "facets:pr-review-gh requires a PR number." >&2
  exit 1
fi
if [ "${CI:-}" = "true" ] || [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "WARNING: local:pr-review-gh runs locally; this skill family does not ship a CI variant. Use the repo-level pr-review-ci instead if you need CI verdicts." >&2
fi
```

Parse `<OWNER>` and `<REPO>` from `git remote get-url origin` (handles both `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git`).

If `--watch` was passed, also capture `<BOT_LOGIN>=$(gh api user --jq '.login')` for use in Step 9.

## Step 2: Fetch PR details

```bash
PR_JSON=$(gh pr view <PR_NUMBER> --json title,body,baseRefName,headRefName,headRefOid,state 2>&1)
if [ $? -ne 0 ]; then
  echo "gh pr view <PR_NUMBER> failed: $PR_JSON" >&2
  exit 1
fi
```

Extract `<BASE_BRANCH>`, `<HEAD_BRANCH>`, `<HEAD_SHA>`, `state`. Validate that all three branch/SHA fields are non-empty AND not whitespace-only (use `[ -z "${X//[[:space:]]/}" ]` — bare `[ -z "$X" ]` lets whitespace pass). If `state` is not `OPEN`, inform the user and stop. Then fetch refs, falling back to HTTPS if SSH auth fails (e.g. the ssh-agent / 1Password agent is down) so a broken agent can't block the review:

```bash
# Use `git -c remote.origin.url=…` for the HTTPS retry (NOT a bare `git fetch
# <url>`, which only moves FETCH_HEAD) so refs/remotes/origin/* actually update —
# Step 2b and the engine read origin/<BASE>/origin/<HEAD>. Surface the SSH error;
# stop loudly if HTTPS also fails rather than reviewing stale refs.
if ! git fetch origin; then
  https_url=$(node "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/scripts/review-scope.ts" --to-https "$(git remote get-url origin)")
  echo "git fetch origin failed; retrying over HTTPS: $https_url" >&2
  git -c remote.origin.url="$https_url" fetch origin \
    || { echo "fetch failed over SSH and HTTPS — cannot review reliably." >&2; exit 1; }
fi
```

## Step 2b: Assemble `INTENT_CONTEXT` (PR body + commit messages)

Give the review agents the *intent* behind the diff so they don't over-rate deliberate, documented changes (the recurring false-positive class: a commit-documented test/feature removal flagged as lost coverage). Gather the changed-commit messages:

```bash
MERGE_BASE=$(git merge-base "origin/<BASE_BRANCH>" "origin/<HEAD_BRANCH>")

# Changed-commit messages (subject + body) for this PR's range.
git log --format='%h %s%n%b' "$MERGE_BASE..origin/<HEAD_BRANCH>"
```

Assemble these — plus the PR `title`/`body` already in `PR_JSON` (Step 2) — into a single `INTENT_CONTEXT` text block (PR title+body, then commit messages). If both are empty, leave `INTENT_CONTEXT` empty.

## Step 2c: Reuse a prior local review (skip the panel)

The common workflow is `pr-review-local` → post the same findings to GitHub. When the PR head is byte-identical to what `pr-review-local` already reviewed, posting shouldn't re-run the 10-agent panel — reuse the findings it left in the ledger (feedback #21; this is the bridge the rejected `--post`-on-local idea was reaching for, done without breaking local's zero-GitHub contract). **Immediate review only — a `--watch` cycle always runs fresh** (unattended re-reviews favor coverage over cost).

Attempt reuse **only when the local checkout *is* the PR head with a clean tree** (the review-local→post case); otherwise fall straight through to Steps 3–6:

```bash
if [ "$(git rev-parse HEAD)" = "<HEAD_SHA>" ] && [ -z "$(git status --porcelain)" ]; then
  MERGE_BASE=$(git merge-base "origin/<BASE_BRANCH>" HEAD)
  slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
  LEDGER_DIR=${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}
  # pr-review-local writes the BRANCH-keyed ledger — read that one (not the pr<N> key).
  LEDGER="$LEDGER_DIR/${slug%%/*}-${slug##*/}-branch-$(printf '%s' "<HEAD_BRANCH>" | tr '/ ' '-').json"
  RUN_HASH=$(node "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/scripts/review-scope.ts" --run-hash --base "$MERGE_BASE")
  node "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/scripts/findings-ledger.ts" \
    --ledger "$LEDGER" --check-cache --run-hash "$RUN_HASH"
fi
```

The clean-HEAD guard is what makes the run-hash match safe: `review-scope --run-hash` folds in `git diff HEAD`, so it only equals the value `pr-review-local` stored when that local review was also clean and at this exact commit — never when uncommitted/unpushed work diverged.

- **`cache_hit` true** → a local review of this exact input exists. **Ask the user:** _"Reuse the N findings from your local review (unchanged since `<head_sha>`) and post them, or run a fresh review?"_ On **fresh** → Steps 3–6 as normal. On **reuse**:
  1. Re-derive `snapped_line` (the ledger doesn't store it) with the **cheap deterministic scripts only — no agents**: `build-changed-lines.ts --base "$MERGE_BASE" --head HEAD` → changed-lines; write the cached `findings` to a file; `validate-findings.ts --findings <file> --changed-lines <cl>` → kept findings now carrying `snapped_line`, plus any dropped. Build against **local `HEAD`** (which the guard pins to `<HEAD_SHA>`), NOT `origin/<HEAD_BRANCH>` — the cached findings were anchored to local HEAD by `pr-review-local`, and `origin/<HEAD_BRANCH>` may have advanced since `<HEAD_SHA>` was captured (it's read before the Step 2 fetch), which would snap against the wrong commit's diff. (`$MERGE_BASE` on line 103 is already `merge-base origin/<BASE_BRANCH> HEAD`, matching that anchor.)
  2. Set `FINDINGS` = the kept set, `COUNTS` from it, `DROPPED_FINDINGS` from the validator, `FAILED_AGENTS` = 0 (no agents ran), then go to **Step 7** — skipping Steps 3–6 and 6b (the ledger already holds this run). The expensive panel is skipped; the correctness pipeline (snap + resilient POST) is not.
- **`cache_hit` false, not on the PR head, dirty tree, or `--watch`** → run Steps 3–6 normally.

## Steps 3–6: Shared review base

**Read `${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/SKILL.md` and follow Steps 3–6 there**, with these inputs:

- `DIFF_SOURCE` = `pr`
- `HEAD_REF` = `origin/<HEAD_BRANCH>`
- `EXCLUDE_AGENTS` = `["docs"]` when `--fast` was passed, otherwise empty
- `INTENT_CONTEXT` = the block assembled in Step 2b (empty if nothing was gathered)

The base produces: `FINDINGS`, `DROPPED_FINDINGS`, `FAILED_AGENTS`, `COUNTS`, `DROPPED_COUNTS`, `TOTAL_AGENTS_LAUNCHED`.

## Step 6b: Findings ledger (stateful re-runs)

So re-reviewing an evolving PR doesn't re-post findings already addressed or deliberately deferred, merge this run's findings into a persisted ledger (feedback #19), keyed by PR number. Write the Step 6 `FINDINGS` array (the kept findings) to `/tmp/facets-findings.json` as a JSON array, then merge it:

```bash
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')   # owner/repo
LEDGER_DIR=${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}
# `pr<PR_NUMBER>` namespace is distinct from pr-review-local's `branch-<name>` key.
LEDGER="$LEDGER_DIR/${slug%%/*}-${slug##*/}-pr<PR_NUMBER>.json"

# --write persists the updated ledger. If the merge fails (bad dir, disk), fall
# back to posting the plain stateless Step 7 review — never assume unpersisted state.
node "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/scripts/findings-ledger.ts" \
  --ledger "$LEDGER" --findings /tmp/facets-findings.json --head-sha "<HEAD_SHA>" --write \
  || echo "findings-ledger failed; posting the plain (stateless) review without ledger filtering." >&2
```

The merge prints `net_new` / `recurring` / `resolved` / `suppressed`. When building Step 7:

- **Exclude every `suppressed` (wontfix) finding** from `comments[]` AND the body — never re-post a finding the operator marked wontfix in the ledger.
- Surface the `net_new` count in the body (e.g. `N new since the last review of this PR`).
- **If the merge command failed**, post the plain Step 7 review (no ledger filtering) rather than assuming any wontfix/net-new state that wasn't persisted.
- The ledger lives **outside** the repo (`~/.claude/facets/reviews/…`, override dir via `FACETS_LEDGER_DIR`). The `posted_comment_id` field is available to record the comment IDs the reviews POST returns, so a later run can recognize an already-posted finding rather than duplicate it.

**Marking a finding wontfix:** set its `status` to `"wontfix"` in the ledger JSON by hand (no flag); future reviews stop posting it.

## Step 7: Post the review as `COMMENT`

Build a JSON object at `/tmp/facets:pr-review-gh-<PR_NUMBER>-comments.json`:

```json
{
  "commit_id": "<HEAD_SHA>",
  "event": "COMMENT",
  "body": "<REVIEW_BODY>",
  "comments": [
    {
      "path": "<file>",
      "line": <snapped_line>,
      "side": "RIGHT",
      "body": "**[SEVERITY]** <description>\n\nSuggestion: <how to fix>"
    }
  ]
}
```

Always use `"event": "COMMENT"` — never auto-approve or request changes.

**Anchor every inline comment on `snapped_line`, not the raw `line`.** The reviews API requires each comment's `line` to be an exact diff line; the engine already computes `snapped_line` (the nearest changed line) for each kept finding for exactly this. Use `snapped_line` as the comment `line`. A kept finding with **no** `snapped_line` (the `runtime` sentinel handled below, or a pure-rename finding with no diff line) cannot be anchored — keep it out of `comments[]` and surface it in the `### Runtime findings` / audit section of the body instead, with a one-line note that it was not postable inline. This is the deterministic version of the old hand re-anchoring; never post a raw `line` that isn't a diff line, or the batch 422s.

**Runtime-sentinel findings never go in `comments[]`.** A finding with `file: "runtime"` (the `runtime-validation` sentinel for issues with no source location) has no valid `path`/`line` for the GitHub reviews API — including one would 422 the entire POST and collapse every inline comment into the fallback. Route those findings into the review `body` instead, as a `### Runtime findings` section (one `**[SEVERITY]** <description>` line each); only real-path findings go inline.

### Body format

```
## Parallel PR Review (Claude — local:pr-review-gh)

**Reviewed commit:** `<HEAD_SHA_SHORT>`

| Severity | Count |
|----------|-------|
| Critical | X |
| High | X |
| Medium | X |
| Low | X |

<details>
<summary>Audit trail — <N> finding(s) dropped by the engine's scope filter</summary>

| Drop reason | Count |
|---|---|
| File out of scope | DROPPED_COUNTS.out_of_scope |
| Line pre-existing (outside ±15 of any changed line) | DROPPED_COUNTS.pre_existing |
| Markdown documentation example | DROPPED_COUNTS.doc_example |

If the filter dropped something it shouldn't have, the kept-finding list above will need a manual top-up — see the dropped JSON in `/tmp/pr-review-gh-<PR_NUMBER>-dropped.json` for the full details (file/line/description/distance_to_nearest_changed_line).

</details>

_Automated parallel review. Re-runs on new commits if `--watch` is active._
```

The `<details>` audit block is rendered only when `DROPPED_FINDINGS` is non-empty; omit the entire block when zero findings were dropped (no noise on clean diffs). Write `DROPPED_FINDINGS` to `/tmp/pr-review-gh-<PR_NUMBER>-dropped.json` so the user can inspect locally — do NOT post the full dropped list inline (most are noise).

If `<FAILED_AGENTS>` is non-zero, prepend `> WARNING: <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>) — review may be incomplete.` to the body.

If zero findings AND zero failures, submit with empty `comments[]` and a body saying `Sentinel: REVIEW_CLEAN — no issues found in this review.`. If zero findings BUT non-zero failures, the body must say `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.`

### Submit (resilient — one bad anchor can't sink the batch)

First try the batch review (one API call, all comments at once):

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews \
  --method POST \
  --input "$REVIEW_FILE"
```

On success, clean up (`rm -f "$REVIEW_FILE"`) and go to Step 8.

**On a non-zero exit (typically a 422 from a line that isn't an exact diff line), do NOT fall straight to a single PR-level comment** — that throws away every good comment because of one bad anchor. Instead degrade in two stages:

1. **Per-comment retry.** Post the review `body` first as a standalone review (empty `comments[]`, `event=COMMENT`), then post each inline comment individually so a single rejection only drops that one:

   ```bash
   gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
     --method POST \
     -f commit_id="<HEAD_SHA>" -f path="<file>" -F line=<snapped_line> -f side=RIGHT \
     -f body="**[SEVERITY]** <description> …"
   ```

   Collect the comments that still 422 and list them in the terminal (file/line/why) so they aren't silently lost.

2. **Last resort.** If even the standalone `body` review fails (permissions, auth), post the whole report as a single PR-level comment via `gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments`.

Always `event=COMMENT`; never approve or request changes, in any path. Clean up `$REVIEW_FILE` when done.

## Step 8: Report

Print the sentinel:

```
Sentinel: REVIEW_DONE_PR — PR #<PR_NUMBER>, <N> findings, mode=LocalPR, commit=<HEAD_SHA_SHORT>
```

If `--watch` was NOT passed, the skill is complete here. If `--watch` WAS passed, proceed to Step 9.

## Step 9: Schedule the watcher (only with --watch)

Use `CronCreate` to schedule a recurring job every 5 minutes (`*/5 * * * *`, recurring: true). Each cycle that detects a new commit runs a full multi-agent review, so a tighter interval mostly burns tokens re-checking an unchanged SHA. `CronCreate` is environment-specific — if it is not available (see Error handling), `--watch` degrades to a one-shot review.

### Placeholder discipline (CRITICAL)

Two kinds of placeholders in the watcher prompt:

- **CronCreate-time placeholders** (substitute BEFORE CronCreate): `<PR_NUMBER>`, `<OWNER>`, `<REPO>`, `<REPO_PATH>`, `<HEAD_BRANCH>`, `<BASE_BRANCH>`, `<BOT_LOGIN>`. These seven are static.
- **Cycle-derived** (do NOT substitute): `${CYCLE_HEAD_SHA}`, `${CYCLE_HEAD_SHA_SHORT}`, `${CYCLE_PR_STATE}`, `${CYCLE_LAST_REVIEWED_SHA}`, `${CYCLE_FAILED_AGENTS}`, `${CYCLE_LAST_REVIEWED_RAW}`. Computed inside each cycle.

Pre-flight before CronCreate: refuse empty/whitespace-only prompt; refuse if any of the seven static placeholders remain unsubstituted.

```bash
if [ -z "${ASSEMBLED_PROMPT//[[:space:]]/}" ]; then
  echo "Sentinel: WATCH_REJECTED — assembled prompt is empty or whitespace-only." >&2
  exit 1
fi
ALLOWLIST_REGEX='<(PR_NUMBER|OWNER|REPO|REPO_PATH|HEAD_BRANCH|BASE_BRANCH|BOT_LOGIN)>'
if printf '%s' "$ASSEMBLED_PROMPT" | grep -Eq "$ALLOWLIST_REGEX"; then
  echo "Sentinel: WATCH_REJECTED — CronCreate-time placeholder still present." >&2
  exit 1
fi
```

### Watcher prompt

```text
You are the PR review watcher for PR #<PR_NUMBER> in <OWNER>/<REPO>.
Repo path: <REPO_PATH>
Head branch: <HEAD_BRANCH>
Base branch: <BASE_BRANCH>
Bot login: <BOT_LOGIN>

This is a RECURRING cron job. Each run is one check cycle. After completing a cycle, simply end your response — the cron scheduler will invoke you again in 5 minutes.

Every shell command below must be checked for non-zero exit. On ANY non-zero exit, say "Sentinel: WATCH_TRANSIENT_ERROR — step <N> (<command>): <stderr>" and end this cycle.

Note on shell syntax: `set CYCLE_X = ...` is pseudocode for `CYCLE_X=$(cmd)` (bare LHS — bash assignment never uses `${VAR}=...`). The `${CYCLE_*}` form is for reading.

CYCLE START:

1. FETCH AND CHECK STATE:
   Run: cd <REPO_PATH> && git fetch origin. If it exits non-zero (SSH agent down), retry over HTTPS so origin/* actually updates (a bare `git fetch <url>` only moves FETCH_HEAD): `git -c remote.origin.url="$(node "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/scripts/review-scope.ts" --to-https "$(git remote get-url origin)")" fetch origin`. If BOTH the SSH and HTTPS fetch fail, that is a non-zero exit per the cycle rule above → say "Sentinel: WATCH_TRANSIENT_ERROR — step 1 (git fetch): SSH and HTTPS both failed" and end this cycle (never proceed on stale refs).
   set CYCLE_HEAD_SHA = `git rev-parse origin/<HEAD_BRANCH>` — abort if empty.
   set CYCLE_PR_STATE = `gh pr view <PR_NUMBER> --repo <OWNER>/<REPO> --json state --jq '.state'` — abort if gh fails or returns whitespace-only.
   If ${CYCLE_PR_STATE} is not "OPEN": say "Sentinel: WATCH_PR_CLOSED — PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting." and end.
   set CYCLE_HEAD_SHA_SHORT = first 7 chars of ${CYCLE_HEAD_SHA}.

2. GET LAST REVIEWED SHA. Use --arg login binding:
   set CYCLE_LAST_REVIEWED_RAW = `gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews?per_page=100`
   If gh exit code != 0: abort cycle with WATCH_TRANSIENT_ERROR (do NOT fall through to "review everything").
   set CYCLE_LAST_REVIEWED_SHA = `printf '%s' "${CYCLE_LAST_REVIEWED_RAW}" | jq --arg login "<BOT_LOGIN>" -r '[.[] | select(.user.login == $login or ((.body // "") | test("Parallel PR Review|Code Review Summary|local:pr-review-gh|pr-review-gh")))] | sort_by(.submitted_at) | last | .commit_id // ""'`
   If gh exit was zero AND ${CYCLE_LAST_REVIEWED_SHA} is empty: proceed with empty value (review everything on first sighting).

3. COMPARE SHA:
   If ${CYCLE_HEAD_SHA} == ${CYCLE_LAST_REVIEWED_SHA}: say "Sentinel: WATCH_REVIEW_CLEAN — PR #<PR_NUMBER> still at ${CYCLE_HEAD_SHA_SHORT}, no new commits since last review." and end this cycle.

4. NEW COMMIT DETECTED:
   Say "New commit detected on PR #<PR_NUMBER>: ${CYCLE_HEAD_SHA}. Running full review..."

5. **Read `${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/SKILL.md` and follow Steps 3–6 there**, with:
   - <DIFF_SOURCE> = pr
   - <HEAD_REF> = origin/<HEAD_BRANCH>
   - <BASE_BRANCH> = <BASE_BRANCH>
   - re-discover PROJECT_CONTEXT and conditional flags per cycle (do NOT cache from earlier cycles).

   The base produces: <FINDINGS>, ${CYCLE_FAILED_AGENTS}, <COUNTS>, <TOTAL_AGENTS_LAUNCHED>.

5b. MERGE THE FINDINGS LEDGER (same PR-keyed merge as the initial run's Step 6b):
   This is the stateful re-review the ledger exists for — without it, every watcher cycle reposts findings the operator already marked wontfix and never tags what is genuinely new. Run the SAME merge the initial run does, keyed by `pr<PR_NUMBER>` (the same key the initial Step 6b writes), before building the cycle's review. Write the Step 5 <FINDINGS> array to /tmp/facets-findings.json as a JSON array, then merge:
   ```bash
   slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')   # owner/repo
   LEDGER_DIR=${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}
   LEDGER="$LEDGER_DIR/${slug%%/*}-${slug##*/}-pr<PR_NUMBER>.json"
   node "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/scripts/findings-ledger.ts" \
     --ledger "$LEDGER" --findings /tmp/facets-findings.json --head-sha ${CYCLE_HEAD_SHA} --write \
     || echo "findings-ledger failed; posting the plain (stateless) review without ledger filtering." >&2
   ```
   The merge prints net_new / recurring / resolved / suppressed. When building Step 6's review:
   - **Exclude every suppressed (wontfix) finding** from comments[] AND the body — never re-post a finding the operator marked wontfix in the ledger.
   - **Tag every net_new finding as [NEW]** in its comment/body line, and surface the net_new count in the body (e.g. "N new since the last review of this PR").
   - **Best-effort:** if the merge command exited non-zero, post the plain Step 6 review (no ledger filtering, no [NEW] tags) rather than assuming any wontfix/net-new state that wasn't persisted.

6. POST REVIEW to GitHub:
   Build a JSON file at /tmp/facets:pr-review-gh-<PR_NUMBER>-cycle.json with commit_id=${CYCLE_HEAD_SHA} (NOT a CronCreate-time SHA), event="COMMENT", body (summary table), and comments[] array. Drop the suppressed (wontfix) findings and tag net_new as [NEW] per Step 5b. Anchor each inline comment on the finding's snapped_line (never a raw line that isn't a diff line). Findings with file=="runtime" — or any kept finding lacking snapped_line — go into the body as a "Runtime findings" section, NEVER into comments[] (an invalid path/line 422s the whole POST).
   If ${CYCLE_FAILED_AGENTS} > 0, prepend "> WARNING: ${CYCLE_FAILED_AGENTS} of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>) — review may be incomplete." to the body.
   Submit using the resilient procedure from Step 7's "Submit" section (batch POST, then per-comment retry on 422, then a single PR-level comment as last resort) instead of aborting the cycle on the first non-zero exit.
   Clean up: rm -f /tmp/facets:pr-review-gh-<PR_NUMBER>-cycle.json

7. Say "Sentinel: WATCH_REVIEW_DONE — PR #<PR_NUMBER> commit ${CYCLE_HEAD_SHA_SHORT}: <N> findings (X critical, Y high, Z medium, W low)."

CYCLE END — the cron scheduler will run this again in 5 minutes.
```

After CronCreate returns the job ID:

1. Report the job ID to the user.
2. Tell them they can cancel with `CronDelete` using that ID.
3. Note that the watcher auto-expires after 3 days.
4. Only THEN is the skill complete.

## Error handling

- If the PR doesn't exist: tell the user and stop.
- If posting the review fails: fall back to a single PR-level comment (`gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments`).
- If `CronCreate` is not available: skip continuous monitoring, inform the user that `--watch` requires `CronCreate`.

## Notes

- **`COMMENT` event only** — never auto-approve or request changes. The user reviews findings and decides.
- **`--watch` semantics**: 5-minute cron, self-contained per cycle (no CronCreate-time SHA leakage); watcher cycles re-discover project context AND conditional flags per cycle so newly-added React/Web3/Tailwind code triggers the right agents on subsequent runs, and each cycle re-applies the same PR-keyed ledger merge as the initial run's Step 6b (Step 5b) so wontfix findings stay suppressed and net-new findings are tagged [NEW] across re-reviews.
- **Pairs with `/facets:pr-fix`**: this skill posts findings; `/facets:pr-fix` applies them. **Do NOT run both watchers on the same PR** — the fix watcher's pushes re-trigger the review watcher, and any new finding re-triggers the fix watcher: an unattended ping-pong loop that burns tokens and spams the PR. Watch with one skill at a time and run the other on demand.

## Sentinel grammar

| Sentinel | Owning step | Trailer grammar |
|---|---|---|
| `REVIEW_CLEAN` | Step 7 | `— no issues found in this review.` |
| `REVIEW_INCOMPLETE` | Step 7 | `— <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.` |
| `REVIEW_DONE_PR` | Step 8 | `— PR #<PR_NUMBER>, <N> findings, mode=LocalPR, commit=<HEAD_SHA_SHORT>` |
| `WATCH_REJECTED` | Step 9 pre-flight | `— <reason>` (empty/whitespace prompt OR un-substituted CronCreate-time placeholder) |
| `WATCH_TRANSIENT_ERROR` | Step 9 watcher (any cycle command) | `— step <N> (<command>): <stderr>` |
| `WATCH_PR_CLOSED` | Step 9 watcher Step 1 | `— PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting.` |
| `WATCH_REVIEW_CLEAN` | Step 9 watcher Step 3 | `— PR #<PR_NUMBER> still at ${CYCLE_HEAD_SHA_SHORT}, no new commits since last review.` |
| `WATCH_REVIEW_DONE` | Step 9 watcher Step 7 | `— PR #<PR_NUMBER> commit ${CYCLE_HEAD_SHA_SHORT}: <N> findings (X critical, Y high, Z medium, W low).` |
