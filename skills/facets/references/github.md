# GitHub workflows

Require authenticated `gh`. Accept PR URL, `owner/repo#N`, or number; validate numeric ID and current `origin` owner/repo. Surface API/fetch failures. The explicit `pr-review-gh` route includes a `COMMENT` review post; natural “review PR” is read-only unless posting is requested. Watching, resolving, pushing, or creating requires that named intent.

## Review exact PR

Read title, body, state, base/head refs, and head SHA with `gh pr view`; require open state. Fetch base and `pull/<N>/head` into a unique `refs/facets/...` ref, retrying an SSH failure through a temporary HTTPS remote override; stop if both fail. Verify the fetched ref equals the reported SHA and create a detached worktree under `mktemp -d`. Give reviewers that absolute directory. Before posting, query SHA again; if changed, re-review. Remove only the temporary worktree/ref afterward.

When posting, always use review event `COMMENT`; never approve/request changes. Inline only findings snapped to valid right-side diff lines at the exact head SHA. Put runtime/pure-rename findings in the body. Include incomplete-panel and dropped-finding warnings. Try batch review, then body plus individual inline retries, then one PR comment fallback; report rejected anchors.

`--fast` omits only the immediate docs persona; `--watch` cycles always use the full panel.

Keep review state outside the repo, under `${FACETS_LEDGER_DIR:-${CODEX_HOME:-$HOME/.codex}/facets/reviews}`, keyed by owner/repo/PR. Merge with `../../plugins/facets/skills/pr-review-engine/scripts/findings-ledger.ts`: post net-new findings, summarize recurring/resolved, and suppress `wontfix`. Never cache a failed panel. When local `HEAD` equals PR SHA, the tree is clean, and the local run hash matches, offer reuse or a fresh panel; reuse reruns only deterministic line snapping. Watch cycles always run fresh.

## Switch

Read metadata first; ask before closed/merged PRs. If dirty, show exact status and wait for stash (`git stash push -u` with a named message), user-managed commit, abort, or discard. A failed stash stops. Discard requires a second explicit confirmation listing exact paths: resolve and verify a nonempty repo root, restore tracked files first and check success, then clean only that root's untracked paths. Record current branch; fetch and run `gh pr checkout`; never auto-pop a stash. If checkout fails, surface its error, warn that the stash remains and the tree may be half-switched, and stop. Report PR/title/branch/base/SHA, ahead/behind, previous branch, and stash reminder only after success. Stop without reviewing.

## Create draft PR

This named route authorizes one branch if needed, one commit if staged content exists, push, and one draft PR—never force-push or merge.

1. Resolve/fetch default branch; inspect branch, status, and full base diff. Infer `feat|fix|chore`, conventional title, and kebab slug.
2. On default, create `<type>/<slug>` from current `HEAD`; otherwise keep the branch.
3. Stage tracked edits with `git add -u`; inspect/add only related untracked files. Exclude `.env*`, `*.local`, keys/certs, editor/scratch files, and suspected secrets. Never blind `git add -A`; list deliberately excluded untracked files.
4. Inspect staged diff; commit `<type>: <description>` if nonempty; push upstream, never force.
5. Choose at most one obvious existing label. Create with `gh pr create --draft --base <base> --assignee @me`; body has `## Motivation` and `## Solution` derived from code.

Stop on auth, conflict, rejected push, empty diff, or ambiguous secret ownership. Return URL, branch, title, and label.

## Address review threads

Require a clean tree, fetch the exact open PR, and check out its head branch with `gh pr checkout` unless already there. Probe base conflicts without changing history; if using a no-commit merge, abort it immediately when clean. Merge only to resolve actual, unambiguous conflicts and validate the result. When conflicts are resolved, finish and push the merge commit before applying review-thread fixes; never mix review-thread fixes into `MERGE_HEAD`. Fetch all pages of unresolved, non-outdated threads; classify actionable, question, praise, stale, or already addressed. Verify current code and read full file, implementation, callers, types, tests, rules, and PR intent. Apply `review.md` fix-rubric/confidence rules; group accepted fixes by file; run focused then project gates. Stage exact fix files, commit once, push.

For `pr-fix`, do not run the review panel or runtime unless separately requested. For each thread use the most recent comment as guidance and the first comment's database ID for replies; retain author/source. Classify actionable, question, discussion/opinion, praise, stale, or already addressed. Ambiguity defaults to leaving it for a human. Parse reviewer severity; human comments default high absent softer language. When Web3 is in scope, substantive contract address/calldata/import/interaction/Solidity comments are critical unless explicitly nit/optional/style. Print source, severity, actionable, and skipped counts before editing.

Abort an ambiguous merge before continuing with review-thread fixes; do not leave conflict state behind. Apply high-confidence fixes; apply medium-confidence fixes but flag them for double-checking; skip low-confidence or mutually contradictory requests. Focused and project validation must pass before any fix commit or push. Stage exact files and create a single fix commit only when the staged diff is nonempty.

Only after successful push, reply on each fixed thread with the commit SHA and resolve it. Reply with reason to skipped/question/stale/disputed threads and leave unresolved; resolve praise/already-addressed only after verification. Re-fetch all pages and inspect the latest comment to reconcile every current thread. Allow CI time to appear, poll it with a bound, and report pending explicitly. Fix CI at most twice only when proven caused by these edits; report other failures.

## Watch

Only on explicit request and when recurring monitoring exists. About every five minutes, re-fetch state and stop when the PR closes.

- **Review watch:** skip an unchanged head SHA; on a new SHA, rediscover context and post only net-new findings.
- **Fix watch:** never gate on head SHA. Every cycle rediscovers project context, flags, and applicable fix rubrics, then checks base conflicts, CI state, and unresolved threads because all can change without a commit; act only on net-new thread/state work.

If recurring monitoring is unavailable, do one shot and say so. Never run review-watch and fix-watch together.

A transient fetch/API/panel failure ends that cycle without advancing reviewed SHA or ledger state. Report the monitor identity and cancellation method when exposed. Default to the former three-day lifetime when expiry is configurable; otherwise state that monitoring is indefinite.
