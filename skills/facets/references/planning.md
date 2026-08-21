# TIB, TIP, Linear, and shipping

From the Facets `SKILL.md`, resolve TIB template `../../plugins/facets/skills/tib-create/template.md` and TIP template `../../plugins/facets/skills/tip-create/template.md`. Translate legacy `/facets:<route>` examples to `$facets <route>`.

## Create TIB

Argument = decision title; ask only if empty. Resolve date `YYYY-MM-DD`, author (`@` + nonempty `gh api user` login, else git name), and lowercase kebab slug near 60 chars. Use first existing `docs/tibs`, `docs/rfcs`, `docs/adrs`, `docs/architecture`, `docs/decisions`; else create `docs/tibs`. Path is `<dir>/TIB-<date>-<slug>.md`. On collision ask overwrite/suffix/new slug; never overwrite silently.

Replace every `__TITLE__`, `__DATE__`, `__AUTHOR__` in the canonical template and write one file. Report path and next steps; ask before opening an editor. Never branch, commit, or push. New status is Proposed; accepted TIB decisions are frozen—supersede them or add operational clarification, do not rewrite direction.

## Create TIP

Arguments: `<title> [--tib <path>]… [--dir <path>]`; reject blank title and validate TIB paths before writing. Resolve metadata as above. Use explicit dir, else first existing `docs/tips`, `docs-as-code`, `docs`, else create `docs/tips`. Filename `TIP-<date>-<slug>.md`; ask on collision.

Extract each TIB H1 ID/title, Context, and Goals/Non-Goals. Seed one verbatim with attribution; group many under per-TIB headings; build relative links. Detect nearest `package.json`, lockfile package manager, existing format/lint/typecheck/build/test scripts, and Biome/Prettier fallback; use explicit TODOs for unknown commands.

Find `TIP-*.md` siblings sharing a TIB. Materialize the template, then change only each sibling's `Sibling TIP(s)` field: merge the relative link, preserve order, dedupe normalized paths. Re-runs must be idempotent. Report changed paths; ask before opening. Never branch, commit, or push. TIPs are mutable Draft → Approved → In Progress → Shipped; TIBs stay frozen.

Replace every template token with resolved metadata, links, commands, or TODOs; remove the extra TIB reference bullet when none is given; verify no `__…__` remains.

## Convert document to Linear

Requires connected Linear tools. If unavailable, tell the user to connect/install Linear and stop before writes; never fabricate IDs or use another tracker.

Arguments: `<doc-path> [project-name-or-id]`; ask for either when missing. `new` creates a project.

Read TIB/TIP/ADR/RFC metadata, context, goals, scope, solution, phases, tradeoffs, deferrals, references, files, and acceptance criteria. Suggest a team from scope; resolve a documented team ID, otherwise ask and separately offer to record the mapping in repo guidance. Resolve named project or `new`. Explicit phases become ordered milestones; otherwise derive, label them derived, and ask for confirmation.

For `new`, the project description must include Vision/context, Motivation/goals, Scope, source path, and a warning when the source status is Proposed or Draft. Preserve source phase descriptions in ordered milestones.

Create a preview of PR-sized issues with implementation plus tests together, real dependencies, priority (`1` blocker, `2` core/phase 1, `3` later, `4` deferred), optional 1/2/3/5 estimate, existing labels only, Backlog state, and descriptions containing Context, source References, and an “AI-generated—starting point, not prescription” Possible solution. Follow the repository's issue-title convention. Show project description, milestones, issues, dependency graph, target/team/counts. Write nothing until the user approves all, a subset, or edits.

On approval, search exact artifacts from the same source and reuse them; stop on conflicting same-name items. Create/reuse project, milestones, issues in dependency order, then relationships. Avoid dangling edges for subsets. Return URLs/IDs and reused items. Do not change git files.

## Ship accepted TIB locally

Arguments: `<tib-path> [--phase <name>]… [--max-iters N] [--no-runtime]`; default five. This route authorizes TIP/implementation edits, creation or explicitly confirmed reuse/replacement of the target local branch, and green local commits—never push, PR creation, force operations, or TIB edits.

Hard-stop for a missing path, dirty or detached tree, or unknown requested phase. Fetch the remote default and parse explicit phases, else one title phase. For a non-`Accepted` TIB, warn and require explicit confirmation to proceed. If the target branch exists, show its tip and unmerged commits, then ask whether to reuse it, replace it, or choose another name; never replace it without explicit confirmation naming the branch. Run baseline tests once; if red, show exact failures and ask whether to stop or proceed. On proceed, record them and require every later gate to introduce no new failures. Create one concrete TIP per phase after repository inspection. Create, reuse, or replace `tib-ship/<TIB-ID>-<short-slug>` according to the confirmed choice.

Before implementation, load the installed skills and bundled review personas applicable to the TIP's declared files, using the mapping in `review.md`; give their implementation-safe rules to the implementer so writing and review use the same rubric. For every phase: add a meaningful gating test and confirm it fails for the intended behavior; if it already passes, surface whether the test is weak or the work already exists and ask before continuing. Implement the minimum; update TIP boxes; format → lint → typecheck → affected tests. Run only discovered gates and record unavailable commands as gaps. At most two repairs per failed gate; never commit red work. If new production logic lacks a meaningful gating test, stop unless the user explicitly accepts a documented `kind: no-tdd` justification. Commit each green phase as `feat(<scope>): <phase>` with TIP/TIB trailers. Stop on missing referenced files, conflicting TIP edits, or roughly 20 unrelated files.

Then run the cumulative review/fix loop in `review.md`, selecting its commit-authorized variant; that file owns the convergence, stuck-detection, low-finding and rollback rules. Every green review-fix commit includes a `TIB: <TIB-ID>` trailer. At the iteration ceiling, print residual findings and ask whether to extend, accept-and-continue with the branch marked not review-clean, or stop. Run runtime once after complete static convergence for changed UI unless disabled. `tib-ship` never uses the `pr-review-local --goal` GitHub/push exception. Set each completed TIP to `In Progress` and report branch, TIPs, phases, gates, iterations, residual lows, runtime, and commits. End with manual push and `$facets pr-create` suggestions; do neither.
