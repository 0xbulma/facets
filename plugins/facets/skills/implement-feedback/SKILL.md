---
name: implement-feedback
version: 1.0.0
description: Pick up a logged facets improvement and implement it in the facets plugin — the counterpart to /facets:feedback. Reads a feedback GitHub issue (or a local backlog entry), branches, implements the change to the repo's conventions (version bumps, cross-file invariants, tests), validates, and opens a draft PR that closes the issue. Use when user says /facets:implement-feedback, "implement this feedback", "build the feedback issue", "action a facets improvement", or "do the implement counterpart". Takes a feedback issue number; --local reads the backlog; --goal runs the full review/fix/re-review loop before the PR.
---

# /facets:implement-feedback — Implement a logged facets improvement

The counterpart to `/facets:feedback`. Where `feedback` *captures* an improvement idea (as a GitHub issue on the facets repo, or a local backlog entry), this skill *acts on one*: read the record, implement it in the facets plugin to the repo's conventions, validate, and open a draft PR that closes the issue.

`feedback` is deliberately repo-agnostic (it runs from anywhere and files centrally). This skill is **not** — it edits the facets plugin's own code, so it must run **inside a clone of the facets repo**. It refuses otherwise (mirrors `pr-switch`'s cross-repo guard).

## Usage

```
/facets:implement-feedback <issue-number>          # implement a feedback issue, open a draft PR
/facets:implement-feedback                          # no arg → list open `enhancement` issues and pick
/facets:implement-feedback --local                  # pick an entry from the local backlog instead of an issue
/facets:implement-feedback <issue-number> --goal    # implement, then loop review->fix->re-review until clean, then PR
/facets:implement-feedback <issue-number> --goal --max-iters 8   # raise the loop ceiling (default 5)
/facets:implement-feedback <issue-number> --goal --no-runtime    # skip the post-convergence runtime-validation shot
/facets:implement-feedback --repo owner/repo <issue-number>      # target a fork / different facets repo
```

## Examples

```
/facets:implement-feedback 42
/facets:implement-feedback 42 --goal
/facets:implement-feedback --local
```

## Arguments

`$ARGUMENTS` carries an optional feedback **issue number** plus flags:

- A bare integer → the feedback issue to implement.
- `--local` → skip GitHub; pick an entry from the local backlog (`~/.claude/facets-backlog.md`, override `FACETS_BACKLOG`).
- `--repo owner/repo` → target a different facets repo (precedence below).
- `--goal` → after implementing, run the autonomous review->fix->re-review loop before opening the PR (see **Step 7b**).
- `--max-iters N` / `--no-runtime` → only meaningful with `--goal`; passed through to the loop.

If no issue number and no `--local`, go to Step 2's interactive pick.

## Placeholder convention

| Placeholder | Source |
|---|---|
| `<FACETS_REPO>` | resolved target repo (`--repo` → `FACETS_REPO` → default `0xbulma/facets`) |
| `<CUR_OWNER>` / `<CUR_REPO>` | parsed from `git remote get-url origin` |
| `<ISSUE>` | the feedback issue number (empty in `--local` mode) |
| `<DEFAULT_BRANCH>` | `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` |
| `<SLUG>` | kebab-case slug derived from the issue title / backlog entry |
| `<BRANCH>` | `feat/feedback-<ISSUE>-<SLUG>` (or `feat/feedback-<SLUG>` in `--local` mode) |

## Step 1: Resolve the target repo and enforce the in-repo guard

Resolve `<FACETS_REPO>` in order of precedence:

1. `--repo owner/repo`, if given.
2. `FACETS_REPO` environment variable, if set.
3. Default: `0xbulma/facets`.

Validate it looks like `owner/repo`. Then detect the current repo:

```bash
git remote get-url origin
```

Parse `<CUR_OWNER>/<CUR_REPO>` (strip `.git`; handle both `git@github.com:o/r.git` and `https://github.com/o/r.git`). If `git` isn't available or there's no `origin`, abort and tell the user they must run this inside a clone of `<FACETS_REPO>`.

**In-repo guard.** If `<CUR_OWNER>/<CUR_REPO>` ≠ `<FACETS_REPO>`, **refuse**:

```
This skill implements changes in the facets plugin itself, so it must run inside a clone of <FACETS_REPO> — but this working directory is <CUR_OWNER>/<CUR_REPO>.

`cd` into your facets clone and re-run me there (or pass --repo to target the repo you're actually in).
```

Do not clone, do not `cd`, do not edit anything. Stop. This is the deliberate inverse of `feedback`, which runs anywhere precisely because it only *files* a note.

## Step 2: Select the feedback item

### 2a: Issue number given

```bash
gh issue view <ISSUE> --repo <FACETS_REPO> --json number,title,body,state,labels,url
```

Check the exit code. On non-zero (auth missing, network down, issue not found, private without access), surface gh's stderr verbatim and stop. If `state` is `CLOSED`, surface it and ask whether to continue (the user may have meant a different issue).

### 2b: No argument → interactive pick

```bash
# Prefer the `enhancement` label, but fall back to all open issues — `feedback`
# creates issues WITHOUT a label when `enhancement` doesn't exist on the target
# repo (feedback/SKILL.md Step 4), so a label-only filter would hide them.
gh issue list --repo <FACETS_REPO> --label enhancement --state open --json number,title,url
# If that returns nothing, re-list without the label filter before concluding:
gh issue list --repo <FACETS_REPO> --state open --json number,title,url,labels
```

Print the list (number — title) and ask the user which issue to implement. Only if the **unfiltered** list is also empty, say so and suggest `/facets:feedback` to log one first (or `--local`). Once chosen, fetch its body as in 2a.

### 2c: `--local` → backlog entry

Read `~/.claude/facets-backlog.md` (or `FACETS_BACKLOG`). Each entry is a `## <title>` block with `when:` / `from:` / `problem:` / `proposal:` lines (the shape `feedback --local` writes). Print the titles, ask the user which to implement, and use that entry's `problem` / `proposal` as the spec. There is no issue to close in this mode — note that in the final report so the user can update the backlog by hand.

## Step 3: Parse the spec and gather context

From the issue body (or backlog entry), extract the three sections `feedback` writes: **Problem**, **Evidence**, **Proposal**. These are the spec — what to change and why.

Read the repo's conventions so the implementation conforms:

1. `CLAUDE.md` (root) — **always**. It owns the versioning rules, the agent contract, the cross-file invariants, and the "common gotchas". Treat it as binding.
2. `AGENTS.md` if present (root + along the touched paths).
3. The specific files the proposal touches (the target `SKILL.md` / agent / reference / script), plus their siblings, so the change matches local style.

Identify the **change surface**: which skill, agent, reference, script, hook, or manifest the proposal affects.

## Step 4: Clean-tree check and branch

```bash
git status --porcelain
```

If non-empty, abort with: _"Working tree is not clean. Commit or stash before /facets:implement-feedback."_ — do not sweep unrelated edits into this change.

Resolve the default branch and create a feature branch off it:

```bash
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
# Guard (mirrors the Step 2a exit-code check): a failed `gh repo view` (auth
# dropped, network down) yields an empty value that would corrupt every
# downstream ref — `git fetch origin ""`, `origin/`, `gh pr create --base ""`.
if [ -z "$DEFAULT_BRANCH" ]; then
  echo "implement-feedback: could not resolve the default branch (is gh authenticated?). Aborting." >&2
  exit 1
fi
git fetch origin "$DEFAULT_BRANCH"
git checkout -b <BRANCH> "origin/$DEFAULT_BRANCH"
```

`<SLUG>` is a short kebab-case slug from the issue title (e.g. `pr-review-local: cache findings` → `cache-findings`). `<BRANCH>` = `feat/feedback-<ISSUE>-<SLUG>` (or `feat/feedback-<SLUG>` in `--local` mode).

> If the user explicitly asked to extend an existing branch/PR rather than branch off the default, honor that: stay on the current branch instead of cutting a new one, and skip the branch-creation in this step.

## Step 5: Implement to the repo's conventions

Make the change the proposal describes — and **only** that change. Then satisfy the authoring contract.

Read the **canonical authoring checklist** — the same rubric the `skill-authoring` review agent grades against, so what you write here is what passes review there (one contract, enforced on both the write and the review side):

```bash
cat "${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/references/skill-authoring.md"
```

That reference is the shared source of truth; the repo's `CLAUDE.md` / `AGENTS.md` are its binding refinements and win on any conflict. **Satisfy every item in that reference** — in particular its version-bump rules, the cross-file inventory invariants, and the conditional-agent trigger-flag rule. Do not restate them here, so the reference stays the single contract both this skill and the `skill-authoring` review agent grade against.

Two facets-specific notes the reference does not carry:

- **Semver for the plugin `version` bump** — new skill / agent / conditional flag / prereq → minor; prompt-only edit → patch; trigger-flag rename or output-shape change → major.
- **Add or extend tests** for the behavior the proposal introduces, matching the existing suite (`test/plugin.bats` for plugin shape; colocated `*.test.ts` for any script). The reference locks *inventory* invariants but not feature tests.

## Step 6: Validate

Discover and run the repo's gates, and **report exactly what ran**. For facets:

```bash
bats test/                      # plugin shape, frontmatter, version fields, agent/trigger invariants
pnpm install && pnpm verify     # Biome + tsc + Vitest — run when any TS script changed
```

Detect gates generically from the repo (don't assume): a `test/` dir with `.bats` files → `bats test/`; a `package.json` with a `verify` / `test` / `lint` / `typecheck` script → run them via the repo's package manager (lockfile-detected: pnpm/yarn/npm/bun). If a gate is red, **fix it before continuing** — never open a PR on a red gate. If a gate genuinely can't run (missing toolchain), say so in the report rather than claiming it passed.

## Step 7: Routing — default vs `--goal`

- **Default** (no `--goal`) → commit, then open a draft PR (**Step 7a**).
- **`--goal`** → commit the implementation, run the autonomous review->fix->re-review loop, and only open the PR once it converges (**Step 7b**).

### Step 7a: Commit and open a draft PR (default)

Stage deliberately — never `git add -A` blind (mirror `pr-create` Step 3): stage tracked modifications with `git add -u`, and add new files only when they belong to this change (skip `*.local`, `.env*`, keys, scratch). List anything deliberately left out.

```bash
git commit -m "<type>: <short summary of the implemented feedback>"
git push -u origin <BRANCH>
```

Open the draft PR (reuse `pr-create` Step 4 conventions — derive everything from the change, ask nothing):

```bash
gh pr create \
  --draft \
  --base "$DEFAULT_BRANCH" \
  --title "<type>: <short summary>" \
  --assignee @me \
  --body "$(cat <<'BODY'
## Motivation

Implements feedback #<ISSUE>: <one-line problem statement from the issue>.

## Solution

<what changed and how it addresses the proposal>

Closes #<ISSUE>
BODY
)"
  # --label <existing-repo-label>   # add only if `gh label list` confirms it exists
```

- `Closes #<ISSUE>` links the PR so **merging** closes the issue — do not close it by hand here.
- In `--local` mode there is no issue: omit `Closes #...`; instead note in the body which backlog entry this implements, and remind the user to prune that entry after merge.
- Attach a label only if it already exists on the repo (`gh label list -L 200 --json name --jq '.[].name'`); `gh pr create` errors on an unknown label.

Then go to Step 8.

### Step 7b: Goal loop, then PR (`--goal`)

After committing the implementation (same deliberate staging as 7a, but do **not** push yet), run the proven autonomous loop instead of opening the PR immediately:

1. **Read `${CLAUDE_PLUGIN_ROOT}/skills/pr-review-local/SKILL.md` and execute its "Goal mode" section** against the branch's commits — `DIFF_SOURCE=local`, base = `<DEFAULT_BRANCH>`, honoring its pre-flight gates and the `--max-iters` / `--no-runtime` flags passed here. Do not re-implement the loop — delegate to it so the sentinels and per-iteration `fix(review)` commits stay identical.
2. **On `GOAL_CLEAN`** → the branch is clean and committed (the implementation commit plus any `fix(review)` iteration commits the loop made). Push and open the draft PR using **only Step 7a's push + `gh pr create`** — the commit already happened in this step, so do NOT re-run 7a's commit (there is nothing staged). The PR body still carries `Closes #<ISSUE>`. Then go to Step 8.
3. **On any non-success sentinel** (`GOAL_ABORTED`, `GOAL_STUCK`, `GOAL_MAXED`, `GOAL_RUNTIME_RED`) → **do NOT open the PR.** Surface the sentinel and the residual findings, and stop for the user. The branch is left at its last green commit (the loop's own clean-up guarantees this). The user can re-run with a higher `--max-iters`, fix the sticking point, or open the PR by hand.

`--goal` supersedes the default: the PR is opened only through the converged path in step 2 above.

## Step 8: Report

```
Implemented feedback #<ISSUE>: <title>
  Branch:   <BRANCH>
  Files:    <N> changed (plugin.json <old>→<new>; <skill/agent> <old>→<new>)
  Gates:    bats <PASS/FAIL> · pnpm verify <PASS/FAIL/skipped>
  Mode:     draft PR | --goal (clean after <i> iteration(s))
  PR:       <url>

Next:
  Review the draft, then mark it ready. Merging closes #<ISSUE>.
```

In `--local` mode, replace the issue line with the backlog entry title and remind the user to remove it from the backlog after merge.

## Notes

- **Inverse of `feedback`.** `feedback` only writes a record and never touches facets code; `implement-feedback` is the half that changes code, so it is repo-bound by the Step 1 guard.
- **One issue per run.** Keep PRs atomic — they review and revert cleanly.
- **Conventions are binding, not advisory.** The Step 5 version-bump + cross-file-sync discipline is exactly what the repo's bats suite enforces; skipping it produces a red PR, not a silent pass.
- **`--goal` never opens a PR on a non-converged branch.** A stuck or budget-exhausted loop stops for the user instead of shipping half-reviewed work.
- **Never bypass the clean-tree or in-repo guards.** They exist so this skill can't clobber unrelated work or edit the wrong repo.
