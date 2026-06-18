---
name: feedback
version: 1.0.0
description: Capture an improvement idea for the facets plugin itself — as a GitHub issue on the facets repo, or appended to a local backlog — from whatever repo you're working in. Grounds the note in concrete evidence (the current repo, branch, or PR) and previews before posting. Use when the user says /facets:feedback, "log a facets idea", "file this as a facets improvement", "facets should…", or wants to capture friction with a facets skill without leaving their current task.
---

# /facets:feedback — Log a facets improvement from anywhere

Light-touch verb: turn an in-the-moment observation about the facets skills into a durable, grounded improvement record — without derailing the task you're on. It captures feedback; it does **not** edit facets or open PRs.

The target is the **facets plugin repo**, not the repo you're currently in. So the record goes to a central place (a GitHub issue on the facets repo, or a local backlog file), never into the working repo under review.

## Usage

```
/facets:feedback <note>                 # capture this improvement idea
/facets:feedback --repo owner/repo <note>  # target a fork / different facets repo
/facets:feedback --local <note>            # append to the local backlog instead of opening an issue
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

Compose a tight, conventional issue:

- **Title** — `<skill or area>: <one-line summary>` (e.g. `pr-review-local: cache findings across re-runs`). Lowercase after the colon, imperative, no trailing period.
- **Body** — three short sections:
  - **Problem** — what's missing or wrong, in one or two sentences.
  - **Evidence** — the grounding from Step 2 (repo/branch/PR or an abstracted stand-in), and the exact symptom.
  - **Proposal** — the concrete change suggested. Mark it "rough idea" when it is one; don't over-specify.

## Step 4: Preview, then post (this is outward-facing — confirm first)

Show the user the resolved target repo, the title, and the body. Posting to a repo is public and notifies watchers, so **wait for explicit confirmation** before creating anything.

On confirm, create the issue:

```bash
# Use the `enhancement` label only if it exists on the target repo; otherwise omit --label.
gh issue create --repo <FACETS_REPO> --title "<title>" --label enhancement --body-file <tmpfile>
```

- Write the body to a temp file and pass `--body-file` (avoids shell-quoting issues with backticks/code).
- If the `enhancement` label is absent (`gh label list --repo <FACETS_REPO>` doesn't list it), retry without `--label`.
- If `gh` is unavailable or the create fails, fall back to **Step 5**.

Print the returned issue URL.

## Step 5: Local backlog fallback (`--local`, or when posting isn't possible)

Append a dated, structured entry to a central backlog outside the working repo — default `~/.claude/facets-backlog.md` (override with `FACETS_BACKLOG`). Never write it into the repo under review.

```
## <title>
- when: <ISO date>
- from: <current repo/branch/PR, abstracted if sensitive>
- problem: <…>
- proposal: <…>
```

Tell the user where it was appended and that they can batch the backlog into issues later (re-run `/facets:feedback` per entry, or open them by hand).

## Notes

- One idea per invocation — keep records atomic so they triage cleanly.
- Don't auto-post: the preview-then-confirm gate in Step 4 is the whole point of the verb. A surprise public issue is exactly the footgun this skill avoids.
- This skill never modifies the facets repo's code or opens PRs — it only files an issue or appends to the backlog.
