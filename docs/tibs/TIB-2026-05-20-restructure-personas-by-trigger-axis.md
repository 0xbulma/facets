# TIB-2026-05-20: Restructure personas by trigger axis

| Field             | Value                                                                |
| ----------------- | -------------------------------------------------------------------- |
| **Status**        | Superseded                                                           |
| **Date**          | 2026-05-20                                                           |
| **Author**        | @0xbulma                                                             |
| **Scope**         | Repo-wide (`plugins/local/personas/` + dispatcher)                   |
| **Superseded by** | TIB-2026-05-20-pr-review-engine-skill                                |

> **Note:** This proposal was superseded the same day after review of Anthropic's
> official `anthropics/skills` repository revealed that several of its core
> mechanisms (three-tier folder grouping, top-level `_shared/` directory,
> frontmatter manifests with `owns:`/`defers:`/`fix-rubric:` keys, closed trigger
> flag enum) conflict with Anthropic's documented conventions. The replacement TIB
> adopts Anthropic's `skill-creator`-style layout (`SKILL.md` + `agents/` +
> `references/`) inside a single new `pr-review-engine` skill.

---

## Context

The `pr-review-*`, `pr-fix`, and `tib-ship` skills delegate Steps 3–6 of their flow to
`plugins/local/lib/pr-review-base.md`. Step 5 of that dispatcher iterates every file under
`plugins/local/personas/*.md` and spawns one parallel `general-purpose` Agent per persona whose
trigger condition matches the diff. Today there are 11 persona files arranged in a flat folder.

An audit of those 11 files surfaced four structural problems:

1. **Mixed taxonomy.** The 11 files mix three different organizing axes:
   - by **stack** — `react-next-best-practices`, `ai-sdk-best-practices`, `web3-security`
   - by **activity** — `test-coverage`, `documentation`, `runtime-validation`
   - by **failure mode** — `silent-failure-hunter`, `code-quality`, `code-simplifier-performance`

   The axis is not declared anywhere, so trigger conditions, ownership boundaries, and "which
   persona fires on what diff" are decided ad hoc per file.

2. **Combo personas.** Four files openly fuse multiple concerns:
   - `ci-release-security.md` — CI workflow security + release/publish integrity + dependency hygiene
   - `code-simplifier-performance.md` — its own header reads "Two concerns sharing a persona"
   - `ui-styling-accessibility.md` — Tailwind/tokens + a11y
   - `documentation.md` — self-described "Three concerns, one persona" (JSDoc + Markdown drift +
     pointer/backlink integrity)

   Combo personas mean the dispatcher fires the whole bundle on any sub-trigger, and the parallel
   agent reasoning about CI workflow injection also reasons about lockfile drift.

3. **Hard finding-level overlap.** `code-quality` and `code-simplifier-performance` both claim
   "duplicated logic / deep nesting" as in-scope. On a typical PR both agents fire and report the
   same finding. Similar collisions exist between `react-next-best-practices` and
   `code-simplifier-performance` (memoization), and between `silent-failure-hunter` and
   `react-next-best-practices` (effect cleanup).

4. **Duplicate marketplace-rubric loads.** The `building-components` marketplace skill is declared
   as a canonical rule by both `react-next-best-practices` AND `ui-styling-accessibility`. The
   `ai-elements` and `streamdown` skills are declared by both `ai-sdk-best-practices` AND
   `ui-styling-accessibility`. The same rubric is fetched and read in full by two parallel agents
   on the same diff.

A secondary issue is **skill ↔ persona coupling**: `pr-fix/SKILL.md` (831 lines, the largest
skill in the repo) hardcodes `web3-security.md`, `ci-release-security.md`, and `documentation.md`
inline as fix rubrics at Step 6a.5, instead of going through the dispatcher. Any change to those
persona filenames or contents requires editing `pr-fix` too.

## Goals / Non-Goals

**Goals**

- Each persona file owns exactly one concern, with a sharp boundary the dispatcher can rely on.
- The dispatcher's trigger logic is structural (closed enum of flags), not free-text regex over
  `<HAS_X>` markers.
- A typical PR fires **fewer** parallel persona agents, not more, despite the file count growing.
- Marketplace rubrics referenced by multiple personas are loaded once, not N times.
- `pr-fix` consumes personas through the dispatcher; no hardcoded persona filenames in skills.

**Non-Goals**

- Rewriting the substantive review rules inside each persona. This TIB moves and splits content,
  it does not change what gets flagged.
- Adding new stack coverage (Vue, Svelte, Rust, etc.). Existing coverage is preserved.
- Touching the 10 skill `SKILL.md` files except `pr-fix` (which has a direct dependency).
  Skill-level bloat — notably `pr-fix` length and the `tip-create` description size — is tracked
  separately and out of scope here.

## Current Solution

```
plugins/local/personas/                  # flat, 11 files, ~68 KB total
├── ai-sdk-best-practices.md             # conditional <HAS_AI_SDK>
├── ci-release-security.md               # conditional <HAS_CI_RELEASE>  (combo)
├── code-quality.md                      # baseline                       (combo)
├── code-simplifier-performance.md       # baseline                       (combo)
├── documentation.md                     # baseline                       (combo)
├── react-next-best-practices.md         # conditional <HAS_REACT>
├── runtime-validation.md                # conditional <HAS_ROUTE_UI>
├── silent-failure-hunter.md             # baseline
├── test-coverage.md                     # baseline
├── ui-styling-accessibility.md          # conditional <HAS_TAILWIND|STYLING>  (combo)
└── web3-security.md                     # conditional <HAS_WEB3>
```

Dispatcher: `plugins/local/lib/pr-review-base.md` Step 5 reads each file, parses its `trigger:`
frontmatter, computes match against free-text `<HAS_*>` markers, fans out one Agent per match.

`pr-fix/SKILL.md` Step 6a.5 hardcodes three persona filenames as fix rubrics, bypassing the
dispatcher.

## Proposed Solution

Reorganize personas by **trigger axis** into three tiers, extract cross-cutting rubrics into a
non-auto-loaded `_shared/` directory, and formalize trigger flags.

### Layout

```
plugins/local/personas/
├── _shared/                              # rubric snippets, NOT auto-loaded by dispatcher
│   ├── secrets-rubric.md                 # single owner: API keys / .env / tokens
│   ├── injection-rubric.md               # XSS, dangerouslySetInnerHTML, eval/exec
│   ├── effect-cleanup-rubric.md          # intervals, listeners, AbortController
│   └── marketplace-rubrics.md            # building-components / ai-elements / streamdown,
│                                         #   referenced once by every persona that needs them
│
├── baseline/                             # always-on, fires on every PR
│   ├── correctness.md                    # was: code-quality (types, smells, cross-file impact)
│   ├── simplification.md                 # was: half of code-simplifier-performance
│   ├── performance.md                    # was: other half — separate trigger heuristics
│   ├── error-handling.md                 # was: silent-failure-hunter
│   ├── tests.md                          # was: test-coverage
│   └── docs.md                           # was: documentation (JSDoc + Markdown only)
│
├── stack/                                # one trigger flag each, mutually exclusive matchers
│   ├── react-next.md                     # trigger: react   — RSC, hooks, composition
│   ├── ai-sdk.md                         # trigger: ai-sdk
│   ├── web3.md                           # trigger: web3
│   ├── styling.md                        # trigger: tailwind|styling — Tailwind/tokens, NO a11y
│   └── accessibility.md                  # trigger: ui-routes
│
└── workflow/                             # triggered by what changed, not the stack
    ├── runtime-validation.md             # trigger: routes
    ├── ci-security.md                    # trigger: workflows         (was ⅓ of ci-release-security)
    ├── release-integrity.md              # trigger: changesets|tags   (was ⅓)
    └── dependencies.md                   # trigger: lockfiles|npmrc   (was ⅓)
```

15 files (was 11). On a typical PR the dispatcher fires **fewer** agents because today's combo
personas fan out on any sub-trigger; the split versions fire only on their specific trigger.

### Frontmatter contract

Every persona declares its own trigger flag(s) from a closed enum, and an explicit ownership
manifest:

```yaml
---
name: simplification
tier: baseline                  # baseline | stack | workflow
triggers: []                    # baseline tier ignores this; others must list ≥1 flag
owns:
  - duplicated-logic
  - over-engineering
  - dead-branches
defers:
  effect-cleanup: error-handling
  memoization: react-next
  perf-hot-path: performance
fix-rubric: true                # consumed by pr-fix; eliminates hardcoded filenames
references:
  - _shared/effect-cleanup-rubric.md
---
```

Closed trigger enum:
`react`, `next`, `ai-sdk`, `web3`, `tailwind`, `styling`, `ui-routes`, `workflows`, `changesets`,
`lockfiles`, `npmrc`, `routes`.

### Dispatcher changes (`lib/pr-review-base.md`)

1. Compute the flag set once from the diff (regex over changed paths + dependency markers).
2. Walk `personas/baseline/` unconditionally.
3. Walk `personas/stack/` and `personas/workflow/`, matching `triggers:` against the flag set.
4. **Skip `personas/_shared/` entirely** — those files are pulled by personas via reference, not
   spawned as agents.
5. Pass each Agent its persona's `owns:` list so it scopes findings; cross-reference `defers:` so
   collisions get routed to the owner.

### `pr-fix` decoupling

Replace the hardcoded persona filenames at Step 6a.5 with the same dispatcher walk used by
`pr-review-*`, filtered to `fix-rubric: true`. Removes ~120 lines from `pr-fix/SKILL.md`.

### Implementation Phases

- **Phase 1 — Extract shared rubrics.** Create `_shared/` and move secrets, injection,
  effect-cleanup, and marketplace-rubric blocks out of the combo personas. No file moves yet,
  no dispatcher changes — combos just become thinner. Verifies the dispatcher tolerates the new
  directory (it ignores `_shared/`).

- **Phase 2 — Split `ci-release-security` 3-way.** Create `ci-security.md`,
  `release-integrity.md`, `dependencies.md`. Update `lib/pr-review-base.md` to add three trigger
  flags (`workflows`, `changesets`, `lockfiles`/`npmrc`). Delete the original combo file. Update
  `pr-fix` Step 6a.5 references.

- **Phase 3 — Split `ui-styling-accessibility` 2-way.** Create `styling.md` and
  `accessibility.md`. The marketplace-rubric dedup from Phase 1 makes this nearly mechanical.

- **Phase 4 — Frontmatter manifests + trigger enum.** Add `tier:`, `owns:`, `defers:`,
  `fix-rubric:` to every persona. Replace `<HAS_*>` free-text triggers in
  `lib/pr-review-base.md` with structural flag matching.

- **Phase 5 — `pr-fix` decoupling.** Rewrite `pr-fix` Step 6a.5 to use the dispatcher walk
  filtered by `fix-rubric: true`. Removes the hardcoded filename list.

- **Phase 6 — Folder restructure.** Move files into `baseline/`, `stack/`, `workflow/`.
  Update the dispatcher walk to iterate three subdirectories instead of one flat one. This
  is the most disruptive change to git history, so it lands last when everything else is
  green.

Phases 1–3 are independently shippable and each delivers value on its own. Phases 4–6 are
load-bearing for the cost reductions and should ship together.

## Considered Alternatives

### Alternative 1: Keep flat layout, only add ownership manifests

Add `owns:`/`defers:` frontmatter to all 11 files without folder restructure or splits.

**Why rejected:** Solves the same-finding-twice problem but not the combo-personas problem.
`ci-release-security` would still fire its full rubric on a workflow-only diff, and the
duplicate marketplace-rubric loads remain. Manifests on combo files also become awkward
("owns: [workflow-injection, release-signing, lockfile-drift]" is three concerns in one bucket
again).

### Alternative 2: Collapse to fewer, broader personas

Merge `code-quality` + `code-simplifier-performance` + `silent-failure-hunter` into one
"general code review" persona. Cuts the dispatcher loop and avoids same-finding-twice trivially.

**Why rejected:** Sacrifices parallelism, which is the dispatcher's main cost-saver — one
800-line persona agent is slower than three 200-line agents running in parallel. Also broadens
ownership boundaries instead of sharpening them, which is the opposite of the goal.

### Alternative 3: Per-stack monorepo (one persona per stack, internally subdivided)

E.g. `react-next.md` contains correctness + tests + a11y + perf sections specific to React.
Each stack persona is self-contained.

**Why rejected:** Re-introduces the combo problem at the stack level (a React diff that only
touches tests would still fire the whole stack rubric), duplicates universal rules across stacks,
and makes adding a new stack proportionally expensive.

### Alternative 4: Rewrite all personas from scratch

Treat current persona content as a draft and rewrite each from a common template.

**Why rejected:** Too much surface area, mixes structural and substantive changes, and risks
losing battle-tested wording. This TIB scope is deliberately structural.

## Assumptions & Constraints

- The dispatcher in `lib/pr-review-base.md` is the only consumer of `personas/*.md` (verified
  via repo-wide grep for `personas/`). If a third skill grows to read personas directly, that
  skill must be updated alongside Phase 5.
- Plugin loaders tolerate nested directories under `personas/`. If a loader hard-codes a flat
  glob (e.g., `personas/*.md`), Phase 6 requires updating that pattern to `personas/**/*.md`
  with an exclusion for `_shared/`. Validate on a smoke-test PR before merging Phase 6.
- The 12-entry trigger enum is sufficient for current stack coverage. A 13th stack means
  editing one enum and adding one persona file — cheap.

## Dependencies

- `plugins/local/lib/pr-review-base.md` — dispatcher (Steps 3–6, especially Step 5).
- `plugins/local/skills/pr-fix/SKILL.md` — Step 6a.5 inline persona references.
- `plugins/local/skills/pr-review-gh/SKILL.md`, `pr-review-local/SKILL.md`, `tib-ship/SKILL.md`
  — consumers of the dispatcher, no direct persona references; should be unaffected.

## Observability

For each phase, dry-run the persona dispatcher against `test/` fixture PRs and compare:

- Number of agents spawned per fixture diff (should be ≤ today's count on every fixture).
- Set of personas fired per fixture (should match the trigger enum's expected behavior).
- Combined token cost per review (should drop by the deduplicated marketplace-rubric load
  weight, ≈4–6K tokens on stacks that hit both `react` and `ui-styling` today).

No production metrics — this is local-dev tooling.

## Security

The restructure does not change what's reviewed, only how it's dispatched. One small win:
extracting `secrets-rubric.md` into `_shared/` gives a single canonical owner for "did this PR
add a hardcoded credential?", which is currently restated (and slightly inconsistently) in three
personas.

## Future Considerations

- Skill-level bloat (`pr-fix` length, `tip-create` description size) is a separate audit
  finding. Phase 5 removes ~120 lines from `pr-fix`, but the full `pr-fix` restructure (move
  the 101-line watcher prompt into a sibling file, extract the conditional rubric switch) is
  out of scope here. Track in a follow-up TIB.
- Adding a `severity:` field to the ownership manifest could let the dispatcher rank findings
  across personas in a single output. Worth a future TIB once the structural changes settle.
- If a future stack persona repeatedly references a rubric that's already in `_shared/`, that's
  the signal that the rubric belongs in `_shared/` — current candidates: "input validation /
  Zod schemas" (no current owner; appears partially in `ai-sdk-best-practices`).

## Open Questions

- Should `_shared/marketplace-rubrics.md` be a single file listing all referenced
  marketplace skills, or one file per skill (`_shared/rubrics/building-components.md` etc.)?
  Leaning toward single file for simplicity; revisit if it grows past ~200 lines.
- Phase 6 (folder restructure) breaks `git blame` on every persona file. Is that an acceptable
  cost for the clarity win? Alternative: keep flat layout permanently and use only frontmatter
  `tier:` for grouping. The folders aid human discovery more than they aid the dispatcher.

## References

- Audit report 1: skills `SKILL.md` audit (10 skills, top finding: `pr-fix` at 831 lines)
- Audit report 2: personas scope map (11 files, four combos, dispatcher mechanism)
- `plugins/local/lib/pr-review-base.md` — current dispatcher
- `plugins/local/skills/pr-fix/SKILL.md` Step 6a.5 — current coupling point
