---
name: facets
description: "Review code or GitHub PRs; fix review comments/conflicts; checkout, draft, post, or watch PRs; draft ADRs/RFCs/TIBs and implementation plans/TIPs; convert design docs to Linear; install engineering/TypeScript conventions or review rubrics; screenshot and test AppKit/wagmi wallet-gated dApps; capture or implement Facets feedback. Use for $facets, legacy /facets:route, or matching natural-language requests."
---

# Facets

Route first. Read matching references completely; combine only where listed.

| Intent / route | Read |
|---|---|
| `review`, `pr-review-local`, review/fix-until-clean | `references/review.md` |
| review/post/watch a GitHub PR; `pr-review-gh` | `references/review.md` + `references/github.md` |
| `pr-fix`, address PR comments | `references/review.md` + `references/github.md` |
| `pr-switch`, `pr-create` | `references/github.md` |
| `tib-create`, `tip-create`, `convert-tib-to-linear` | `references/planning.md` |
| `tib-ship` | `references/planning.md` + `references/review.md` |
| `ts-conventions` | `references/conventions.md` |
| `inject-wallet` | `references/wallet.md` |
| `feedback` | `references/feedback.md` |
| `implement-feedback` | `references/feedback.md` + `references/review.md` + `references/github.md` |
| `setup` | `references/setup.md` |

Natural language, `$facets <route>`, and legacy Claude routes use the same routing. Mutation authority is not equivalent: apply the selected reference's authorization rules and, when ambiguous, state the least-mutating fit.

## Operating rules

- Read applicable `AGENTS.md`; at the repo root, fall back to `CLAUDE.md` when `AGENTS.md` is absent. Read other repo guidance named by the route. Preserve user work; never discard, overwrite, force-push, or merge without explicit authority.
- Inspection is read-only. A workflow authorizes only its documented writes; other commits, pushes, PR/review/thread, Linear, and public-issue writes need separate authority.
- Root agent owns scope, integration, edits, git, and external writes. Parallel subagents inspect bounded lenses; shared-worktree writes stay serialized.
- Use matching installed skills when relevant. Missing rubrics degrade to bundled rules; install only through explicit setup.
- Resolve relative assets/scripts from this `SKILL.md`, not the working directory.
- Report work, validation, residual risk, and blocked/failed participants. Missing evidence is never success.
