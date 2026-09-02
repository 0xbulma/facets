# Review and fix

For `pr-fix`, use only the context, finding/fix gate, applicable persona `## Fix rubric` sections, validation safety, and authoring overlay from this file. Do not run review scope, Panel, aggregation, or Runtime unless the user separately requests a review.

## Context and exact scope

Project rules win. At the repo root, read `AGENTS.md`, or `CLAUDE.md` when `AGENTS.md` is absent; also read `MISSION.md`, `CONTRIBUTING.md`, and existing lint/format/tool config. Read `SECURITY.md` for security, crypto, network, CI, publish, or wallet surfaces and the repo's doc-style guide for exported-doc changes. For each touched package, read applicable nested `AGENTS.md`/`CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, and other top-level package guidance. Obey Codex instruction precedence.

- **Local:** fetch first. If the origin fetch fails over SSH, retry the same fetch with a temporary HTTPS remote override; stop if both fail. Base = user ref, else remote default, then `main`/`master`. Review `merge-base(base, HEAD)..HEAD` plus staged, unstaged, and untracked files. Every line of an untracked text file is changed. Intent includes range commit messages.
- **PR:** follow `github.md` to fetch the reported SHA and create an exact detached temporary worktree. Never mix current `HEAD` or local WIP into PR scope. Intent includes PR title/body and range commits.

Local scope, intent, panel, single-shot fixes, and uncommitted natural-language fix loops are git-only: never call `gh` or read PR titles, bodies, comments, or other GitHub metadata. Never post a review or create a PR. The named `pr-review-local --goal` terminal exception below may query only whether an open PR already exists after complete convergence; it never supplies review context.

Report base, head, merge-base, file count, and merge commits. Abort stale/failed fetches or empty scope. Skip generated files and full lockfiles except for the dependencies reviewer; that reviewer inspects relevant lockfile hunks, not entire generated files.

`--fast` omits only `docs.md` for one immediate review; watched reviews stay full. `--no-runtime` skips runtime with an explicit gap.

When Node >=22.18 exists, use `../../plugins/facets/skills/pr-review-engine/scripts/build-changed-lines.ts` for tracked lines (`--include-uncommitted` locally), then add every untracked text-file line. Use `validate-findings.ts` after reviewers. If those helpers cannot run, continue only when an equivalent changed-line check succeeds; otherwise mark the review incomplete. A helper failure is never clean. `validate-findings.ts` reports an unreadable `--changed-lines` map **in band**: it prints `{"error": …}` and still exits 0, so check the payload shape, not just the status. A result object carrying `error`, or a missing/unreadable changed-lines map or changed-file list, means the scope filter never ran — add `scope-filter` to `FAILED_AGENTS` and mark the review incomplete; never read the resulting empty kept set as clean.

Then run `couple-sweep.ts --base <merge-base> --changed-lines <map>` once per review and merge its array into the findings, stamped `agents:["couple-sweep"]`. It derives file pairings from `git log` before the merge base and reports every changed file whose strongly-coupled partner is absent from the diff — one exhaustive pass instead of a reviewer rediscovering mirror drift one instance per round. Pass the complete changed-file list via `--changed-files` so a binary or uncommitted-only file is never mistaken for an untouched partner. It never compares the contents of two changed partners. Distinguish the two outcomes: exit 0 **and** stdout that parses as a JSON array means the sweep ran, and an empty array is simply no drift — continue. A zero exit whose stdout is missing, empty, or unparseable is NOT a clean sweep; treat it exactly like the failure case below. Any non-zero exit (2 misuse/unreadable input, 3 git unavailable, other = node failed) means the sweep did NOT run; surface its stderr, add `couple-sweep` to `FAILED_AGENTS` (so it reaches the goal loop's `failed_agents` input and the ledger cache-stamp guard), and mark the review incomplete, exactly as for the helpers above. A helper failure is never clean.

## Stateful local runs

Without untracked files, compute `review-scope.ts --run-hash --base <merge-base>`. On an exact successful branch-ledger hit, show the cached result and ask whether to reuse it or run fresh; goal loops and watched runs always run fresh. Reuse reruns deterministic line validation only.

Pipe every fresh run's normalized findings to `findings-ledger.ts --write`, keyed by owner/repo/branch under `${FACETS_LEDGER_DIR:-${CODEX_HOME:-$HOME/.codex}/facets/reviews}`. Stamp head SHA and run hash only when every selected reviewer completed; an incomplete panel may persist findings but must never become a cache hit. Suppress `wontfix`, tag surfaced findings `NEW` or `seen`, and summarize resolved findings. If the ledger fails, fall back to the complete stateless result—never infer state. Disable cache reuse when untracked files exist. Report the ledger path and that manually setting a finding's `status` to `"wontfix"` suppresses it in future runs.

Goal loops do not read the ledger. After complete clean convergence, a commit-authorized loop may stamp the final head/run hash once with only residual low findings so the next unchanged single-shot review can reuse it; uncommitted loops never stamp. Skip when the loop made no commit.

## Conditional flags

Compute these over changed paths and changed-file content. Content matches inside `.md`, `.mdx`, and `.txt` are examples, not code-surface triggers; path matches still apply.

- `HAS_WEB3`: `.sol`; imports of `viem`, `wagmi`, `ethers`, or `web3.js`; contract addresses; or contract read/write/sign/permit patterns.
- `HAS_REACT`: `.jsx`/`.tsx`; React, Next, TanStack React, or Apollo imports; or `'use client'`/`'use server'`.
- `HAS_TAILWIND`: `HAS_REACT` plus Tailwind-shaped JSX classes.
- `HAS_STYLING`: styled-components, Emotion, tss-react, CSS/SCSS modules, or changed `role`/`aria-*`/`tabIndex` markup.
- `HAS_WORKFLOWS`: `.github/workflows/**`, `.github/actions/**`, or `turbo.json`.
- `HAS_RELEASE`: `.changeset/**`, `vercel.json`, changed publish/release/deploy package scripts, or changed `changeset publish`, package-publish, GitHub-release, or Vercel-production commands.
- `HAS_DEPS`: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `pnpm-workspace.yaml`, or `.npmrc` at any depth.
- `HAS_AI_SDK`: AI SDK/AI Elements/Streamdown imports or text/object generation, streaming, embedding, chat, or tool-loop APIs.
- `HAS_SERVER_API`: Next route/API/middleware files, `'use server'`, or Next server, Express, Fastify, Hono, Koa, or tRPC server imports.
- `HAS_ROUTE_UI`: a changed Next page/layout/template/loading/error/route, Pages Router page/API route, SPA page/route/entry, Astro page, or root `index.html`, and an existing dev-server command. Component-only changes do not set it.
- `HAS_PLUGIN_SKILLS`: `SKILL.md`, skill `agents/` or `references/`, `.claude-plugin/*.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, or `agents/openai.yaml`.

Print context files read, every flag, and selected/omitted persona names before launch so omissions are visible.

## Panel

Resolve the bundled directory from the Facets `SKILL.md` as `../../plugins/facets/skills/pr-review-engine/agents/`. Enumerate every `*.md`; do not hardcode discovery. Root reads every selected body completely before launch. Select:

- Every `kind: baseline` persona.
- Every `kind: conditional` persona whose `trigger:` expression matches the flags above. Unknown/invalid triggers make the panel incomplete rather than silently skipping the persona.
- For docs-only diffs, omit only `error-handling`, `tests`, `simplification`, and `performance`; keep `correctness`, `docs`, and applicable path-triggered conditionals.
- For `--fast`, additionally omit `docs` only as described above.
- Run `runtime-validation` after static aggregation for immediate reviews; goal/TIB loops exclude it until static convergence.

Launch one read-only reviewer per selected persona, keeping at most three in flight at once to fit Codex agent slots — launch the next selected persona as soon as any reviewer returns, rather than waiting for a whole wave to finish. Reviewer durations are very uneven, so a barrier between waves would pay the slowest reviewer's tail once per wave. Never collapse several personas into one reviewer and never omit an applicable lens because a diff is small. Each failure therefore affects only that persona, and independent agreement remains measurable.

Give each reviewer the absolute review directory, base/head/merge-base, changed paths and changed-line map, project context, intent/history, conditional flags, and instructions to inspect the full diff, full changed files, relevant callers/tests/schemas/docs, and no unrelated work. Lockfile/generated content follows the exception above. Include the persona body verbatim and resolve its `references/...` from the review-engine directory. Translate only Claude execution mechanics—tool names, skill-discovery paths, and instruction precedence—to current Codex equivalents; keep domain rubrics unchanged. The bundled `references/skill-authoring.md` is canonical for both hosts—apply the touched platform's contract. Root stamps `agents:[<exact persona name>]` before validation; reviewers do not self-attribute.

Resolve `../../plugins/facets/skills/pr-review-engine/SKILL.md` from the Facets `SKILL.md` and extract only the shared-contract span — that file is ~46 KB, so read it bounded rather than whole: `awk '/^### Shared per-agent contract/{f=1} /^### Current agent inventory/{exit} f' ../../plugins/facets/skills/pr-review-engine/SKILL.md`. Append a Codex-host translation of that span as the final content of every reviewer prompt, after intent/history and all other context. Preserve its output schema, line/confidence rules, scope guard, anti-nitpick and intentional-change rules, and kept/dropped calibration examples verbatim; translate only the host mechanics above. Never summarize or replace this shared contract and calibration with a compact substitute.

## Finding gate and aggregation

Keep only defects introduced or made reachable by scope, with concrete impact, an accurate HEAD-side location on/near changed code, and a smaller specific fix. Reject taste, formatter noise, vague hardening, unrelated cleanup, and duplicates.

Confidence is advisory: 90–100 fully proven; 65–85 mechanism proven with contextual impact; 45–65 reasoned inference; omit below ~45. Never hard-filter at 80. Severity is independent: `critical` exploit/fund/data loss; `high` primary behavior/outage/security boundary; `medium` reproducible secondary regression/material hazard; `low` concrete limited impact.

Keep valid findings from a partially malformed result but mark that persona failed. A failed/malformed reviewer makes the whole review incomplete. Validate file/line scope and retain the validator's complete dropped list with reason and distance, not counts alone; write it to a per-run `mktemp` JSON file and report its path plus counts.

Deduplicate only genuine matches: same file/exact line requires at least roughly 50% description overlap or a clear paraphrase; findings within three lines require matching severity and overlapping descriptions. Never merge two `couple-sweep` findings that cite different partner paths: they share one description template, so the overlap test would collapse them and a file with several drifted partners would surface one per round — the tail the sweep exists to remove. A different partner is a distinct finding. For every merged group, keep maximum severity independently, take description and maximum confidence from the highest-confidence evidence, and union exact persona names. Never let higher confidence downgrade severity.

Sort final output by severity, persona count, confidence, path, and line. Render:

`- [high, 92%] path/file.ts:42 — Problem and impact. Fix: smallest change. (correctness, api-security)`

Then list checks, failed/partial reviewers, dropped counts and audit path, and gaps. `No findings.` requires a complete panel and relevant verification.

## Runtime

When `HAS_ROUTE_UI`, read bundled `runtime-validation.md`, then use the installed `agent-browser` skill. Visit at most five closest routes; capture console errors, failed requests, screenshots, and one safe interaction. Never log in or perform payments/deletes/saves. Budget three minutes and stop the exact process. Setup/auth failures are gaps, not product findings. `--no-runtime` reports the gap.

## Fix loop

Read-only unless fixes are requested. Legacy `--fix` requires a clean tree, runs one grouped pass, and leaves validated edits unstaged; `--goal` wins if both flags appear. Before editing, discover the fix-applicable personas with the bundled `../../plugins/facets/skills/pr-review-engine/scripts/list-fix-rubric-agents.sh` (resolved from the Facets `SKILL.md`) and read the `## Fix rubric` section of each persona it returns; fall back to grepping `## Fix rubric` across `agents/*.md` only if the script cannot run. Fix only high/medium-confidence, local, non-conflicting changes; skip ambiguous or architectural fixes. Never auto-change signing/approval semantics, CI secret/event topology, or release identity/tag scope. Read the shared implementation/callers first; fix root cause with the smallest regression check.

Batch fixes by file. For one-shot `--fix`, snapshot each file, apply all accepted findings for it, run focused validation once, and keep or restore that file atomically; restoring a failed file must not erase successful fixes in other files. Then run discovered format → lint → typecheck → tests; invent no command. If pnpm attempts and fails an implicit pre-run install, report a tooling failure and use the resolved local binary or disable `verify-deps-before-run`; do not call it a test failure.

For any “until clean” loop, discover commands first. The `goal-loop.ts` delegation below governs the `pr-review-local --goal` and natural-language fix loops; `tib-ship` keeps its own convergence rules on both hosts until it is migrated, so the two hosts stay in step. Run the baseline test command once: if already red, show exact failures and ask whether to stop or proceed; on proceed, record them and require every later gate to introduce no new failures. Default five iterations (`--max-iters` overrides): static review → decide → fix critical/high/medium per-file atomically → gates → re-review. Never auto-fix lows.

Do not re-derive the stop conditions. After each iteration's review, pipe the state to `../../plugins/facets/skills/pr-review-engine/scripts/goal-loop.ts` on stdin — `{iteration, max_iters, failed_agents, total_agents_launched, prev_actionable_hash, findings, gate_green, head_branch, base_branch}` — `findings` must fold in any synthetic findings from a previous red re-gate. `gate_green` is required and carries the OBSERVED gate result: on iteration 1 the actual outcome of the baseline gate (`false` if any resolved command failed beyond an accepted red baseline, or if any was unresolvable and skipped — an unrun gate is not a green one), and on later iterations whether the PREVIOUS iteration's re-gate ended green. Never send an assumed value; omitting the field yields no decision rather than a false clean, and sending `false` on a first iteration that was actually green would stop an already-clean branch that the other host converges — and obey the returned `action`. `fix` continues the loop. `incomplete`, `stuck`, and `maxed` each stop after printing the returned `sentinel`. `converged` breaks the loop **successfully** and carries no sentinel — the script returns `null` for it by construction, because `GOAL_CLEAN` certifies the runtime pass, the ledger stamp and the push, which come after. Those rules below own the terminal token. Carry `actionable_hash` forward as the next call's `prev_actionable_hash`. `maxed` stops before that round's fixes, so the residual findings match the tree. Check the exit status before reading stdout: stdout is empty on any non-zero exit, so an empty capture is never a decision — stop, **restore per the variant rules below exactly as for an incomplete/stuck/maxed exit**, and report that the stop conditions are unverified rather than treating it as convergence. A helper failure that produced no decision is a non-success exit like any other; leaving the round's uncommitted edits in place would diverge from the other host.

Convergence requires no critical/high/medium findings, `FAILED_AGENTS == 0`, no finding carrying a severity outside {critical, high, medium, low}, and a green last re-gate reported through the required `gate_green` field — an unrecognized label and a red gate are each never auto-fixed and never clean. A failed or malformed reviewer makes that iteration incomplete. If no actionable findings remain while any reviewer failed, stop incomplete without runtime, ledger stamping, committing, pushing, or claiming clean.

On a red loop gate, keep that iteration temporarily and turn the exact gate failures into synthetic findings for the next iteration so its repair can build on them.

**Uncommitted variant (default):** use this for natural-language requests without explicit commit authority. Before editing, save an exact recoverable start snapshot outside the repository covering the index, tracked worktree, and untracked paths; keep loop edits out of the index. A gate that passes, or introduces no failures beyond an accepted red baseline, replaces the last-green snapshot. On incomplete, stuck, maxed, or red exit, restore only loop-authored changes to the last-green snapshot, or the start snapshot when none passed. Never commit, push, call `gh`, or use cleanup that can erase pre-existing work. On convergence, leave the final green edits uncommitted and preserve the pre-loop index state.

**Commit-authorized variant:** use only when the selected route or user explicitly authorizes commits. Require a clean attached branch. Commit each green static iteration as `fix(review): iteration N`, and check that the commit actually succeeded — a rejected commit (signing agent, hook, empty index) leaves the fixes uncommitted while the next review still sees them in the local diff, so the loop would converge and report clean over work that was never committed. On a failed commit, stop and report it; do not restore, the edits are the work. Leave a red iteration uncommitted for the next repair. On incomplete, stuck, maxed, or red exit, discard only the current uncommitted iteration back to the last green commit; preserve earlier green commits.

After complete static convergence, run runtime once. If critical/high findings remain, allow one repair and keep it uncommitted until both the static gate and runtime recheck pass. On success, commit it only in the commit-authorized variant; otherwise update the last-green snapshot and leave it uncommitted. On failure, restore the pre-runtime last-green state and stop runtime-red. Report maxed, stuck, incomplete, or runtime-red with residual findings and the last proven-good state.

Natural-language “fix until clean” selects the uncommitted variant unless the user explicitly requests commits. `pr-review-local --goal` selects the commit-authorized variant and, only after complete clean convergence, may query `gh` read-only for an already-open PR and `git push` that branch. It never creates a PR, posts a review, or uses GitHub metadata as review context; never push on incomplete, stuck, maxed, or runtime-red.
