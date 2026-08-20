# Skill & plugin authoring rubric

The canonical authoring contract for both Facets hosts: Claude Code under `plugins/facets/` and Codex at the repository root. Repo guidance wins over generic platform defaults.

## 1. Skill frontmatter

Shared:

- `name` is required, kebab-case, and matches the skill directory.
- `description` is required, nonempty, and says what the skill does plus concrete when-to-use triggers.

Claude Code skills under `plugins/facets/skills/`:

- Require a semver `version` and bump it when that skill changes.
- This repo forbids XML angle brackets in frontmatter.
- `disable-model-invocation: true` makes a workflow user-only; it does not hide it from the `/` menu.
- `user-invocable: false` hides an internal skill from the `/` menu. An engine consumed by direct file delegation may set both flags; a user route such as `setup` must remain user-invocable.

The root Codex `skills/facets/SKILL.md` intentionally permits exactly `name` and `description`. Do not require a per-skill version, Claude invocation flags, or Claude-only frontmatter rules. Validate its route table and referenced files. When `agents/openai.yaml` exists, keep its display name, short description, and default prompt aligned; the default prompt names `$facets`.

## 2. Manifests and cache invalidation

Claude:

- `plugins/facets/.claude-plugin/plugin.json` requires `name`, `description`, and semver `version`.
- Any change under `plugins/facets/**` requires a Claude plugin-version bump. Existing installs otherwise keep the stale cached plugin.
- `.claude-plugin/marketplace.json` requires `name`, `owner.name`, and a nonempty plugin array.

Codex:

- `.codex-plugin/plugin.json` requires valid `name`, semver `version`, description, author, `skills`, and interface metadata. Its paths and referenced files must exist.
- `.agents/plugins/marketplace.json` must be valid, select the matching plugin, and provide a valid source, install/auth policy, and category.
- Any change under `.codex-plugin/**`, `.agents/plugins/**`, `skills/facets/**`, or `plugins/facets/**` requires a Codex plugin-version bump. The Codex package consumes shared Claude assets, so a shared change requires both platform bumps.

## 3. Progressive disclosure and packaging

- Keep routers concise. Put route-specific detail in `references/*.md` and deterministic parsing/state logic in `scripts/`.
- Every cited reference, script, template, persona, and UI metadata file must exist in the installed package. Resolve relative paths from the consuming `SKILL.md`.
- Claude plugins are cached from `plugins/facets/`; do not point outside that plugin root. Codex installs from the repository root, so its router may reuse `plugins/facets/` assets inside that package.
- Only `plugin.json` belongs in `.claude-plugin/`; do not nest `skills/` or `commands/` there.
- A persona reference and its `## Consumers` list must agree in both directions.

## 4. Review-persona contract

Every `plugins/facets/skills/pr-review-engine/agents/*.md`:

- Has `name` matching its filename and a bumped semver `version` when edited.
- Has `kind: baseline | conditional`; baseline has no `trigger`, conditional has one.
- Has `applies`, `out-of-scope`, `focus`, and severity guidance.
- Uses only trigger flags defined by both the Claude engine and the Codex conditional-flag contract. An unknown flag makes that host silently omit the persona.
- Contains no XML angle brackets in frontmatter.

## 5. Cross-host inventory invariants

Adding, renaming, or removing a route/persona is never a one-file change:

- Every user-invocable Claude route must be present in the Codex router; every router reference must resolve.
- Both hosts must discover every persona from `agents/*.md`, select the same baseline/conditional set, and preserve exact persona attribution. Codex may schedule reviewers in waves, but may not combine or omit applicable personas.
- Conditional trigger tokens in persona frontmatter must be defined on both hosts.
- Human-readable route/persona enumerations in manifests, both READMEs, and repo guidance must match disk.
- Tests derive route, reference, persona, and fix-rubric inventories from the filesystem/frontmatter. Do not add a second hardcoded list that can drift.

## 6. Severity

- **High:** required platform version not bumped; name/frontmatter contract broken; conditional trigger missing on either host; a route/persona exists on only one host; manifest or public inventory contradicts disk.
- **Medium:** internal/user invocation flags expose or hide the wrong Claude route; a cited packaged asset is absent; a Consumers backlink is one-sided; established deterministic logic was replaced with prompt-only parsing.
- **Low:** trigger description is materially incomplete but the skill remains reachable.
- **Omit:** wording, ordering, and stylistic preferences without a behavior or packaging impact.

## Consumers

- `skill-authoring` grades both Claude and Codex authoring surfaces against this reference.
- `implement-feedback` reads it while writing changes, so implementation and review use the same contract.
- Codex `facets` review and feedback routes load it through the persona or directly.
