# Skill & plugin authoring rubric

The canonical authoring contract for Claude Code **skills** and **plugins**, distilled from Anthropic's Agent Skills guidance (the `skill-creator` pattern) and layered with the repo-specific conventions the review reads from `PROJECT_CONTEXT` (the root `AGENTS.md` / `CLAUDE.md`). This is the in-repo source of truth so the `skill-authoring` agent does not depend on an external skill being installed.

**Repo rules win.** Where `PROJECT_CONTEXT` documents its own versioning, frontmatter, or inventory rules (facets' `CLAUDE.md` does, in detail), those are binding and override the generic defaults below. Use this rubric to fill the gaps and to catch the failure modes a repo's own docs assume but don't restate on every change.

## 1. SKILL.md frontmatter contract

- **`name`** — required; kebab-case; **MUST equal the skill's directory name** (`skills/foo/SKILL.md` → `name: foo`). A rename that updates the directory but not `name:` (or vice-versa) is a contract break.
- **`description`** — required, non-empty. Third person. State **what it does AND when to use it** (the trigger phrases that tell the model to invoke it). A vague description is why a skill never fires.
- **`version`** — required; semver (`MAJOR.MINOR.PATCH`).
- **No XML angle brackets (`<` / `>`) anywhere in the frontmatter block.** This is a hard security restriction in the Anthropic Skills guide. Use bare identifiers (`HAS_WEB3`, not `<HAS_WEB3>`); reserve angle-bracket placeholders for the body. FIX: drop the brackets or move the placeholder out of frontmatter.
- **`disable-model-invocation: true`** — set this on any skill that is invoked by *another* skill, or reached through a separate path, so it stays out of the user's slash-command menu. A dispatcher/engine skill that appears in the menu is a contract break.

## 2. Plugin manifest (`.claude-plugin/plugin.json`)

- Required fields: `name`, `description`, `version`.
- **Bump `version` on ANY change to the plugin surface** — SKILL.md, agents, references, hooks, bin, description. The marketplace updater keys cache invalidation off this field: leave it unchanged and `/plugin marketplace update` short-circuits, so every existing install keeps serving the stale cache (old description, old agent roster, old install script) indefinitely. **This is the single highest-signal authoring miss** — a plugin-surface diff with no `version` change is a high-severity finding on its own. FIX: bump per the repo's semver rules (new skill/agent/flag/prereq → minor; prompt-only edit → patch; breaking rename/shape change → major).

## 3. Marketplace manifest (`.claude-plugin/marketplace.json`)

- Valid JSON; `name`, `owner.name`, and a non-empty `plugins` array.
- Any human-readable **enumeration** (skill counts, the skill list, the agent-panel list) must match reality. A description claiming "thirteen skills" when fourteen ship is drift users see first.

## 4. Progressive disclosure & structure

- **SKILL.md stays concise** — the high-level procedure. Push heavy, on-demand detail into `references/*.md` and load it only when needed. Put **deterministic logic in `scripts/`**, not in English prose the model re-derives each run ("code is deterministic; language interpretation isn't").
- **Don't put `commands/` or `skills/` inside `.claude-plugin/`** — only `plugin.json` lives there.
- **Don't reference files outside the plugin root** (`../shared-utils`) — plugins are copied to a cache; siblings won't follow.
- A reference cited by an agent (`Cross-check references/X.md`) must exist; a reference's `## Consumers` list and the citing agents must stay bidirectional.

## 5. Agent frontmatter contract (review-engine personas)

Every `agents/*.md`:

- `name` matches the filename (`web3.md` → `name: web3`).
- `version` is semver.
- `kind: baseline | conditional`. **`baseline` must NOT declare a `trigger:`; `conditional` MUST.**
- A conditional agent's `trigger:` flag **must be defined in the engine's Step-4 flag-detection block** — an undeclared or typo'd flag means the agent silently never launches. FIX: add the `HAS_*` definition bullet to the engine Step 4 in the same change.
- `applies:` / `out-of-scope:` / `focus:` present; severity calibration present (a `## Severity guidance` body section or `severity-guidance:` frontmatter — either, but one is required).
- No XML angle brackets in the frontmatter block (same rule as §1).

## 6. Cross-file inventory invariants

Adding / renaming / removing a skill or agent is **never** a one-file change. Every enumeration must move atomically, or it's drift:

- `plugin.json` `version` (always) and the touched file's own `version:`.
- `marketplace.json` description count + list.
- Both `README.md` files — counts, the directory tree, and the per-skill / per-agent bullets.
- The repo guide (`CLAUDE.md`) — skill list, invoke list, and the mental-model agent counts (`N baseline + M conditional`).
- The test suite's inventory locks (for facets: `SKILLS_ALL`, the "N skills exist" name, the exact agent-file count, and the smoke-install greps).

A one-sided update reads as "covered" but ships an inconsistency the bats suite will fail on. Flag the specific files left behind.

## 7. Severity calibration

- **High** — missing `plugin.json` version bump on a plugin-surface change; frontmatter contract violation (name mismatch, XML brackets in frontmatter, missing `version`, baseline-with-trigger / conditional-without-trigger); a new conditional agent whose trigger flag isn't declared in the engine; cross-file inventory drift (manifest / README / repo-guide / test out of sync with the actual skills or agents).
- **Medium** — `disable-model-invocation` missing on an engine/dispatcher-style skill; a reference cited by an agent that doesn't exist (or a broken `## Consumers` backlink); deterministic logic expressed only in prose where a script is the established pattern.
- **Low** — a description that omits when-to-use triggers; structure nits that still parse.
- **Omit** — wording/style preferences, reordering, and "you could also" suggestions. Authoring review flags contract breaks, not taste.

## Consumers

This reference is the **shared authoring contract**, cited from both the review side and the implement side so the same rules govern writing a change and grading it:

- `skill-authoring` (review-engine agent) — this reference IS its rubric; it grades a diff's authoring conformance against it.
- `implement-feedback` (skill) — reads it in Step 5 as the checklist to satisfy *while writing* a change, so what it produces passes `skill-authoring` review.
