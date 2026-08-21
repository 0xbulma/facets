# Facets feedback

Target precedence: `--repo owner/repo`, `FACETS_REPO`, else `0xbulma/facets`. Before any `gh` call, require exactly two nonempty path components with no whitespace or shell metacharacters.

## Capture

Runs anywhere without code changes. Capture one atomic idea per run; split unrelated notes. Gather repo/visibility, branch/PR, Facets workflow, expected versus observed behavior, minimal evidence, and proposal. For sensitive work, abstract names, code, tickets, and secrets; confirm before identifying anything.

If empty, synthesize the note from this session and confirm it.

Title `<skill-or-area>: <imperative lowercase summary>` with no trailing period. Draft a body with exact `## Problem`, `## Evidence`, and `## Proposal` headings, ending `_Implement with $facets implement-feedback <this issue's number>._`. Search open issues; for a clear duplicate ask whether to comment or file a distinct issue, defaulting to the comment. Preview target/title/body and require confirmation before public create/comment. Use a temp body file; apply/create `enhancement` best-effort and warn if unlabeled. Return URL.

`--local` or unavailable GitHub uses `${FACETS_BACKLOG:-${CODEX_HOME:-$HOME/.codex}/facets-backlog.md}`. Before appending, read it; for a near-identical `## <title>`, show the existing entry and ask whether to skip (default) or append anyway. Otherwise append:

```text
## <title>
- when: YYYY-MM-DD
- from: abstract context
- problem: observation and impact
- proposal: desired behavior
```

`--list` is read-only. Never write the backlog into the current repo.

## Implement

Run only inside the resolved Facets repo; otherwise stop without cloning, changing directory, or editing. Validate the resolved `owner/repo`. Surface issue/list API failures; only a successful empty result means no item exists. Confirm before using a closed issue. Parse its `Problem`, `Evidence`, and `Proposal` as the specification.

Read root `CLAUDE.md`, every applicable `AGENTS.md`, target files, siblings, tests, and `../../plugins/facets/skills/pr-review-engine/references/skill-authoring.md` completely. Repo rules win. The shared reference contains both host contracts; apply the touched platform's rules and synchronize both versions/inventories for shared assets.

Without a number, list open `enhancement` issues then all open issues if empty; ask which to use. `--local` lists backlog entries instead.

Before branching, emit `proceed`, `reshape`, or `skip`: reject stale/superseded/net-negative work; confirm reshaped scope. Require clean tree. Fetch default and create `feat/feedback-<issue>-<slug>` (omit issue for local), unless user explicitly named an existing branch.

Implement the smallest coherent change. Update required plugin/skill/agent versions and synchronized docs/tests. Run detected Bats and package-manager verify/test/lint/typecheck gates; never ship red or claim an unavailable gate passed.

Default route authorizes deliberate staging, one conventional implementation commit, push, and a draft PR with Motivation/Solution and `Closes #N` (local mode names the backlog item instead). Exclude unrelated/secrets and use only existing labels. With `--goal`, commit locally, run the fresh five-iteration loop from `review.md`, and push/create via `github.md` only after convergence; on incomplete/stuck/maxed/runtime-red, do not push or open the PR. Return issue/backlog, branch, validation, commits, and PR URL; remind local users to prune the backlog after merge.
