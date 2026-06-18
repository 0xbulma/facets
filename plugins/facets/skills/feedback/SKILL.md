---
name: feedback
version: 1.0.0
description: Capture an improvement idea for the facets plugin itself — as a GitHub issue on the facets repo, or appended to a local backlog — from whatever repo you're working in. Grounds the note in concrete evidence (the current repo, branch, or PR), de-dupes against existing issues, applies a consistent label so /facets:implement-feedback can action it, and previews before posting. Use when the user says /facets:feedback, "log a facets idea", "file this as a facets improvement", "facets should…", or wants to capture friction with a facets skill without leaving their current task.
---

# /facets:feedback — Log a facets improvement from anywhere

Light-touch verb: turn an in-the-moment observation about the facets skills into a durable, grounded improvement record — without derailing the task you're on. It captures feedback; it does **not** edit facets or open PRs.

The target is the **facets plugin repo**, not the repo you're currently in. So the record goes to a central place (a GitHub issue on the facets repo, or a local backlog file), never into the working repo under review.

## Usage

```
/facets:feedback <note>                 # capture this improvement idea
/facets:feedback --repo owner/repo <note>  # target a fork / different facets repo
/facets:feedback --local <note>            # append to the local backlog instead of opening an issue
/facets:feedback --list                     # print the local backlog entries and exit (read-only)
/facets:feedback                            # no note → offer to synthesize one from this session
```

`$ARGUMENTS` is the free-text improvement note. If empty, offer to draft one from the current conversation (e.g. friction just hit with `pr-review-local`), and confirm the wording before continuing.

## Step 1: Resolve the target facets repo

Order of precedence:

1. `--repo owner/repo` argument, if given.
2. `FACETS_REPO` environment variable, if set.
3. Default: `0xbulma/facets`.

Validate it looks like `owner/repo`. This is where the feedback lands — it is deliberately decoupled from the current working directory.

## Step 2: Gather grounding context (so the note isn't abstract)

A finding with evidence is actionable; a vague wish is not. Collect, best-effort:

- The current repo, if any: `gh repo view --json nameWithOwner,visibility -q '{repo: .nameWithOwner, visibility: .visibility}'` (or `git remote get-url origin`).
- The current branch / PR, if relevant to the friction (`git branch --show-current`; a PR number the user names).
- Which facets skill / step the feedback is about, and what actually happened (the concrete symptom), versus what was expected.

**Privacy guard.** If the current repo is **private** or otherwise sensitive, the facets repo may be public — do not copy proprietary code, secrets, internal repo names, or ticket contents into the issue. Abstract the evidence ("a private TS monorepo", "a multi-commit PR that merged main mid-review") and confirm with the user before including any identifying detail.

## Step 3: Draft the record

Compose a tight, conventional issue. Use **exact `##` headers** for the body sections — the `implement-feedback` counterpart parses them (its Step 3), so the headers are a contract, not just formatting:

- **Title** — `<skill or area>: <one-line summary>` (e.g. `pr-review-local: cache findings across re-runs`). Lowercase after the colon, imperative, no trailing period.
- **Body** — exactly these three sections, each under its own `##` header, plus the footer:

  ```markdown
  ## Problem
  <what's missing or wrong, in one or two sentences>

  ## Evidence
  <the grounding from Step 2 — repo/branch/PR or an abstracted stand-in — and the exact symptom>

  ## Proposal
  <the concrete change suggested; mark it "rough idea" when it is one — don't over-specify>

  ---
  _Implement with `/facets:implement-feedback <this issue's number>`._
  ```

  The footer closes the loop: it points a maintainer (or an agent) straight at the skill that actions this record.

## Step 3.5: Check for an existing duplicate (don't pile on)

`feedback` is one atomic idea per invocation — but the same friction is easy to log twice, and every duplicate is noise the `implement-feedback` counterpart then has to wade through. Before previewing, search the target repo for an open issue covering the same thing:

```bash
# Search open issues by the key terms of the title/problem (matches title + body).
gh issue list --repo <FACETS_REPO> --state open --search "<key terms>" --json number,title,url --limit 10
```

- If a clear match exists, show it to the user and ask whether to **comment on the existing issue** instead — adding the new evidence with `gh issue comment <number> --repo <FACETS_REPO> --body-file <tmpfile>` — or **file a new one anyway** (a genuinely distinct angle). Default to commenting; it keeps the backlog free of near-duplicates.
- If the search call fails (auth/network) or returns nothing, continue to the preview — dedup is best-effort, never a hard gate.
- In `--local` mode, run the equivalent check against the backlog file (see Step 5).

## Step 4: Preview, then post (this is outward-facing — confirm first)

Show the user the resolved target repo, the title, and the body. Posting to a repo is public and notifies watchers, so **wait for explicit confirmation** before creating anything.

On confirm, ensure the discovery label exists, then create the issue with it — a **consistent label is the contract** that lets `/facets:implement-feedback` reliably list feedback issues, so don't drop it silently:

```bash
# Ensure the `enhancement` label exists (idempotent: create only if absent) so every feedback
# issue is discoverable by implement-feedback. Label-create needs the same write access issue-create does.
gh label list --repo <FACETS_REPO> --json name --jq '.[].name' | grep -qx enhancement \
  || gh label create enhancement --repo <FACETS_REPO> --description "facets improvement idea" --color a2eeef 2>/dev/null || true

gh issue create --repo <FACETS_REPO> --title "<title>" --label enhancement --body-file <tmpfile>
```

- Write the body to a temp file and pass `--body-file` (avoids shell-quoting issues with backticks/code).
- If the label still can't be applied (read-only token), retry the create **without** `--label` rather than failing — but warn that `implement-feedback`'s default listing filters on `enhancement`, so an unlabeled issue is only reached via its unlabeled fallback.
- If `gh` is unavailable or the create fails outright, fall back to **Step 5**.

Print the returned issue URL.

## Step 5: Local backlog (`--local`, `--list`, or when posting isn't possible)

The backlog is a central file outside the working repo — default `~/.claude/facets-backlog.md` (override with `FACETS_BACKLOG`). Never write it into the repo under review.

**`--list`** — print the existing entries (their `##` titles and `when:` dates) and exit. Nothing is written; this is the read-only way to see what's already queued.

**Append (`--local`, or any fallback from Step 4).** First de-dupe: read the backlog and, if an entry with a near-identical `## <title>` already exists, show it and ask whether to skip (default) or append anyway. Then append a dated, structured entry whose shape `implement-feedback` reads (its Step 2c):

```
## <title>
- when: <ISO date>
- from: <current repo/branch/PR, abstracted if sensitive>
- problem: <…>
- proposal: <…>
```

Tell the user where it was appended and that they can action the backlog later — `/facets:implement-feedback --local` to implement one, re-run `/facets:feedback` per entry to promote it to an issue, or open them by hand.

## Notes

- One idea per invocation — keep records atomic so they triage cleanly.
- Don't auto-post: the preview-then-confirm gate in Step 4 is the whole point of the verb. A surprise public issue is exactly the footgun this skill avoids.
- This skill never modifies the facets repo's code or opens PRs — it only files an issue or appends to the backlog. (The one exception is creating the `enhancement` label if absent — a prerequisite for the issue it files, not a code change.)
- **Pairs with `/facets:implement-feedback`.** The consistent `enhancement` label and the `## Problem` / `## Evidence` / `## Proposal` body shape are the contract the counterpart reads — keep them stable so logged ideas stay reliably discoverable and parseable.
