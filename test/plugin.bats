#!/usr/bin/env bats
#
# Validates the shape of this repo as a Claude Code plugin marketplace.
# Run: bats test/plugin.bats
#
# Install bats with: brew install bats-core
#

setup() {
  # Resolve repo root from this test file's location.
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
  PLUGIN_DIR="$REPO_ROOT/plugins/facets"
  PLUGIN_MANIFEST="$PLUGIN_DIR/.claude-plugin/plugin.json"
  SKILLS_DIR="$PLUGIN_DIR/skills"
  AGENTS_DIR="$SKILLS_DIR/pr-review-engine/agents"
  SKILLS_ALL="pr-fix pr-review-gh pr-review-local setup pr-create convert-tib-to-linear tib-create pr-switch tip-create tib-ship ts-conventions inject-wallet feedback implement-feedback pr-review-engine"
}

@test "marketplace.json is valid JSON" {
  run jq empty "$MARKETPLACE"
  [ "$status" -eq 0 ]
}

@test "marketplace.json has required fields" {
  run jq -e '.name and .owner.name and (.plugins | length > 0)' "$MARKETPLACE"
  [ "$status" -eq 0 ]
}

@test "plugin.json is valid JSON" {
  run jq empty "$PLUGIN_MANIFEST"
  [ "$status" -eq 0 ]
}

@test "plugin.json has required fields" {
  run jq -e '.name and .description and .version' "$PLUGIN_MANIFEST"
  [ "$status" -eq 0 ]
}

@test "fifteen skills exist at expected paths" {
  for skill in $SKILLS_ALL; do
    [ -f "$SKILLS_DIR/$skill/SKILL.md" ] || { echo "missing $SKILLS_DIR/$skill/SKILL.md" >&2; return 1; }
  done
}

@test "each SKILL.md has name matching its directory" {
  for skill in $SKILLS_ALL; do
    skill_file="$SKILLS_DIR/$skill/SKILL.md"
    name=$(awk '/^---$/{f=!f; next} f && /^name:/{print $2; exit}' "$skill_file")
    [ "$name" = "$skill" ] || { echo "skill=$skill got name=$name" >&2; return 1; }
  done
}

@test "each SKILL.md has a non-empty description" {
  for skill in $SKILLS_ALL; do
    skill_file="$SKILLS_DIR/$skill/SKILL.md"
    desc=$(awk '/^---$/{f=!f; next} f && /^description:/{sub(/^description: */,""); print; exit}' "$skill_file")
    [ -n "$desc" ] || { echo "skill=$skill has empty description" >&2; return 1; }
  done
}

@test "each SKILL.md has a semver version" {
  for skill in $SKILLS_ALL; do
    skill_file="$SKILLS_DIR/$skill/SKILL.md"
    version=$(awk '/^---$/{f=!f; next} f && /^version:/{print $2; exit}' "$skill_file")
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || { echo "skill=$skill version=$version is not semver" >&2; return 1; }
  done
}

@test "each agent has a semver version" {
  for agent_file in "$AGENTS_DIR"/*.md; do
    version=$(awk '/^---$/{f=!f; next} f && /^version:/{print $2; exit}' "$agent_file")
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || { echo "$agent_file version=$version is not semver" >&2; return 1; }
  done
}

@test "no leaked @morpho-org references in plugins/" {
  run grep -rn '@morpho-org' "$PLUGIN_DIR"
  # grep returns 1 when no match — that's what we want.
  [ "$status" -ne 0 ]
}

@test "no leaked 'morpho' references anywhere in plugins/" {
  # Skills imported from morpho-org/sdks must be fully repo-agnostic.
  # No exceptions — including author/owner metadata.
  run grep -rni --exclude-dir=node_modules 'morpho' "$PLUGIN_DIR"
  [ "$status" -ne 0 ]
}

@test "no leaked personal-name references in plugins/" {
  # Only the public 0xbulma handle is permitted.
  run grep -rn 'Benjamin A\|benjamin@' "$PLUGIN_DIR"
  [ "$status" -ne 0 ]
}

@test "no leaked <HOME> template tokens in plugins/" {
  run grep -rn '<HOME>' "$PLUGIN_DIR"
  [ "$status" -ne 0 ]
}

@test "no leaked /.agents/ absolute paths in plugins/" {
  run grep -rn '/\.agents/' "$PLUGIN_DIR"
  [ "$status" -ne 0 ]
}

@test "no leaked ~/.claude/skills/ hardcoded paths in agents + skills" {
  # Hardcoded ~/.claude/skills/<name>/SKILL.md was the old standalone-install pattern.
  # Plugin layout discovers paths via Bash `find` — see CLAUDE.md.
  # bin/install-prereqs.sh and skills/setup/SKILL.md legitimately reference this path
  # because that's exactly where `npx skills add` installs to.
  run grep -rn '~/\.claude/skills/' \
    "$AGENTS_DIR" \
    "$SKILLS_DIR/pr-review-engine/SKILL.md" \
    "$SKILLS_DIR/pr-fix" \
    "$SKILLS_DIR/pr-review-gh" \
    "$SKILLS_DIR/pr-review-local"
  [ "$status" -ne 0 ]
}

@test "agent inventory is exactly 17 files" {
  # 6 baseline + 11 conditional. Three combos (ci-release-security,
  # ui-styling-accessibility, code-simplifier-performance) split per
  # TIP-2026-05-20-persona-refinement (11 - 3 + 7 = 15); api-security
  # added for the server-side trust boundary: 15 + 1 = 16; skill-authoring
  # added for the skill/plugin authoring surface: 16 + 1 = 17.
  count=$(find "$AGENTS_DIR" -maxdepth 1 -name '*.md' -type f | wc -l | tr -d ' ')
  [ "$count" = "17" ]
}

@test "list-fix-rubric-agents.sh returns exit 0 + empty stdout when no agent matches" {
  # Regression test: the script wraps `grep -l ... | sort` in `{ ... || true; }`
  # so a no-match doesn't propagate as a pipefail exit. A regression removing
  # the `|| true` would crash every caller (pr-fix, bats invariant). This test
  # locks the contract: empty agents dir → exit 0, empty stdout.
  EMPTY_DIR="$BATS_TEST_TMPDIR/empty-agents"
  mkdir -p "$EMPTY_DIR"
  # An agents dir with .md files but no `## Fix rubric` sections.
  printf '# placeholder\n' > "$EMPTY_DIR/placeholder.md"

  run "$SKILLS_DIR/pr-review-engine/scripts/list-fix-rubric-agents.sh" "$EMPTY_DIR"
  [ "$status" -eq 0 ] || { echo "expected exit 0; got $status" >&2; return 1; }
  [ -z "$output" ]    || { echo "expected empty stdout; got: $output" >&2; return 1; }
}

@test "pr-fix fix-rubric agent set is exactly the five expected" {
  # pr-fix's confidence gate (Step 6a) walks $AGENTS_DIR for files with a
  # `## Fix rubric` section. Locks the set so a fix-rubric section can't
  # be silently added/removed without an explicit test update.
  # The bundled script `scripts/list-fix-rubric-agents.sh` is the single
  # source of truth for the discovery; this test pins its output.
  expected="ci-security dependencies docs release-integrity web3"
  actual=$("$SKILLS_DIR/pr-review-engine/scripts/list-fix-rubric-agents.sh" \
           | xargs -n1 basename \
           | sed 's/\.md$//' \
           | sort | tr '\n' ' ' | sed 's/ $//')
  [ "$actual" = "$expected" ] || { echo "expected: $expected"; echo "got:      $actual" >&2; return 1; }
}

@test "each agent has name matching its filename" {
  # Mirrors the same invariant we enforce on top-level skills (line 46-52).
  # Catches: a rename (like code-quality → correctness) that updates the
  # filename but leaves the frontmatter `name:` at the old value.
  for agent_file in "$AGENTS_DIR"/*.md; do
    name=$(awk '/^---$/{f=!f; next} f && /^name:/{print $2; exit}' "$agent_file")
    expected=$(basename "$agent_file" .md)
    [ "$name" = "$expected" ] || { echo "agent=$expected got name=$name" >&2; return 1; }
  done
}

@test "each conditional agent declares a trigger" {
  # `kind: conditional` agents must have `trigger:` so the engine knows
  # when to fire them. `kind: baseline` agents must not (they always fire).
  for agent_file in "$AGENTS_DIR"/*.md; do
    kind=$(awk '/^---$/{f=!f; next} f && /^kind:/{print $2; exit}' "$agent_file")
    trigger=$(awk '/^---$/{f=!f; next} f && /^trigger:/{print; exit}' "$agent_file")
    case "$kind" in
      baseline)
        [ -z "$trigger" ] || { echo "$agent_file: kind=baseline but has trigger=$trigger" >&2; return 1; }
        ;;
      conditional)
        [ -n "$trigger" ] || { echo "$agent_file: kind=conditional but no trigger declared" >&2; return 1; }
        ;;
      *)
        echo "$agent_file: kind=$kind is not baseline|conditional" >&2; return 1
        ;;
    esac
  done
}

@test "every conditional trigger flag is defined in the engine's Step 4 detection block" {
  # A conditional agent only fires if the engine's Step 4 computes its
  # trigger flag. A new agent with a typo'd or undeclared flag would
  # silently never launch — no error, just a missing reviewer. This locks
  # every HAS_* token in agent `trigger:` lines to a `- \`HAS_*\`` flag
  # definition bullet in the engine SKILL.md.
  engine="$SKILLS_DIR/pr-review-engine/SKILL.md"
  for agent_file in "$AGENTS_DIR"/*.md; do
    trigger=$(awk '/^---$/{f=!f; next} f && /^trigger:/{sub(/^trigger: */,""); print; exit}' "$agent_file")
    [ -n "$trigger" ] || continue
    for flag in $(printf '%s\n' "$trigger" | grep -oE 'HAS_[A-Z0-9_]+' | sort -u); do
      grep -q -- "- \`$flag\`" "$engine" \
        || { echo "$agent_file trigger flag $flag has no definition bullet in engine Step 4" >&2; return 1; }
    done
  done
}

@test "no XML angle brackets anywhere in skill or agent frontmatter" {
  # Anthropic Skills guide, Reference B: "Forbidden in frontmatter: XML
  # angle brackets (< >) - security restriction". The engine and consumer
  # skills, plus every agent file, must be free of `<` / `>` inside the
  # `---` ... `---` frontmatter block. Body prose may still use the
  # brackets to mark template placeholders — that's not in scope here.
  set +e
  bad=""
  while IFS= read -r f; do
    found=$(awk '
      # Only enter frontmatter mode when the FIRST non-empty line is ---.
      # Markdown horizontal rules (--- inside body) must not increment state.
      NR == 1 && /^---$/ { in_fm = 1; next }
      in_fm && /^---$/   { exit }
      in_fm && /[<>]/    { printf "%s:%d:%s\n", FILENAME, NR, $0 }
    ' "$f")
    if [ -n "$found" ]; then
      bad="${bad}\n${found}"
    fi
  done < <(find "$SKILLS_DIR" -type f -name '*.md')
  set -e
  [ -z "$bad" ] || { printf 'XML brackets found in frontmatter:%b\n' "$bad" >&2; return 1; }
}

@test "engine ships scripts/ with the three bundled helpers" {
  # The Anthropic Skills guide (p. 26) recommends scripting deterministic
  # logic instead of expressing it only in language. The three helpers
  # implement the diff-line build (TS, run via `node`), the finding validator
  # (TS), and the fix-rubric agent discovery (bash) — locking the file list
  # catches a future edit that removes any of them.
  SCRIPTS_DIR="$SKILLS_DIR/pr-review-engine/scripts"
  [ -x "$SCRIPTS_DIR/build-changed-lines.ts" ]   || { echo "missing/non-executable: build-changed-lines.ts" >&2; return 1; }
  [ -x "$SCRIPTS_DIR/validate-findings.ts" ]     || { echo "missing/non-executable: validate-findings.ts" >&2; return 1; }
  [ -x "$SCRIPTS_DIR/list-fix-rubric-agents.sh" ]|| { echo "missing/non-executable: list-fix-rubric-agents.sh" >&2; return 1; }
}

@test "engine ships its bundled references/ files" {
  REFS_DIR="$SKILLS_DIR/pr-review-engine/references"
  for f in changed-lines.md scope-filter.md calibration.md skill-authoring.md; do
    [ -f "$REFS_DIR/$f" ] || { echo "missing reference: $REFS_DIR/$f" >&2; return 1; }
  done
}

@test "ts-conventions ships its reference files and the lint-swap contract" {
  REFS="$SKILLS_DIR/ts-conventions/references"
  for f in principles.md core.md lint-biome.md lint-eslint.md react-next.md web3.md; do
    [ -f "$REFS/$f" ] || { echo "missing reference: $REFS/$f" >&2; return 1; }
  done
  # core.md must keep the placeholder the skill swaps for the linter section.
  grep -q '__LINT_SECTION__' "$REFS/core.md" \
    || { echo "core.md lost the __LINT_SECTION__ placeholder" >&2; return 1; }
}

@test "engine and setup skills set disable-model-invocation: true" {
  # These two skills are invoked by other skills (engine) or by the user
  # via a separate path (setup). They must not appear in the slash-command
  # menu — disable-model-invocation: true is what enforces that.
  for skill in pr-review-engine setup; do
    flag=$(awk '/^---$/{f=!f; next} f && /^disable-model-invocation:/{print $2; exit}' "$SKILLS_DIR/$skill/SKILL.md")
    [ "$flag" = "true" ] || { echo "$skill/SKILL.md missing disable-model-invocation: true (got: $flag)" >&2; return 1; }
  done
}

@test "engine SKILL.md documents the scope-filter contract" {
  # The Step 6 sub-step 1 contract names three drop categories and the
  # CHANGED_LINES tolerance window. Locks these in so a future edit
  # that removes one of the structural filters fails the test.
  # Identifiers in the engine prose are written without `< >` brackets
  # since the Anthropic Skills guide forbids brackets in frontmatter
  # — the body inherits the same convention for consistency.
  engine="$SKILLS_DIR/pr-review-engine/SKILL.md"
  grep -q 'CHANGED_LINES' "$engine"          || { echo "engine missing CHANGED_LINES contract" >&2; return 1; }
  grep -q 'DROPPED_OUT_OF_SCOPE' "$engine"   || { echo "engine missing DROPPED_OUT_OF_SCOPE counter" >&2; return 1; }
  grep -q 'DROPPED_PRE_EXISTING' "$engine"   || { echo "engine missing DROPPED_PRE_EXISTING counter" >&2; return 1; }
  grep -q 'DROPPED_DOC_EXAMPLE' "$engine"    || { echo "engine missing DROPPED_DOC_EXAMPLE counter" >&2; return 1; }
  grep -q 'WHAT:'  "$engine"                 || { echo "engine missing WHAT: schema marker" >&2; return 1; }
  grep -q 'FIX:'   "$engine"                 || { echo "engine missing FIX: schema marker" >&2; return 1; }
  grep -q '±15'    "$engine"                 || { echo "engine missing the ±15 adjacent-code tolerance window" >&2; return 1; }
}

@test "pr-review-local SKILL.md documents the --goal loop contract" {
  # The --goal autonomous loop is a documented contract: the flags plus the
  # full five-sentinel state machine — GOAL_CLEAN (success) and the
  # GOAL_ABORTED / GOAL_STUCK / GOAL_MAXED / GOAL_RUNTIME_RED safety rails
  # (the "Autonomous, not careless" exits). Lock the whole set so a future
  # edit can't silently gut a rail while leaving the description in place.
  # Mirrors the scope-filter test, which locks every DROPPED_* counter, not
  # one representative.
  skill="$SKILLS_DIR/pr-review-local/SKILL.md"
  for token in GOAL_CLEAN GOAL_ABORTED GOAL_STUCK GOAL_MAXED GOAL_RUNTIME_RED; do
    grep -q "$token" "$skill" || { echo "pr-review-local missing $token sentinel" >&2; return 1; }
  done
  for flag in --goal --max-iters --no-runtime; do
    grep -q -- "$flag" "$skill" || { echo "pr-review-local missing $flag flag" >&2; return 1; }
  done
}

@test "every references/*.md pointer in agents resolves to a real file" {
  REFS_DIR="$SKILLS_DIR/pr-review-engine/references"
  # Every "Cross-check `references/X.md`" pointer in an agent body must
  # resolve to an actual file. Catches: a references file renamed or
  # deleted without updating the citing agents.
  missing=""
  for ref in $(grep -rho 'references/[a-z-]*\.md' "$AGENTS_DIR" | sort -u); do
    [ -f "$REFS_DIR/${ref#references/}" ] || missing="$missing $ref"
  done
  [ -z "$missing" ] || { echo "agents point at non-existent references:$missing" >&2; return 1; }
}

@test "references/*.md backlinks are bidirectional" {
  REFS_DIR="$SKILLS_DIR/pr-review-engine/references"
  # Every agent listed in a references file's `## Consumers` section
  # must actually carry a "Cross-check `references/X.md`" pointer line.
  # Catches: a Consumers entry that survives a rename/refactor when
  # the agent's pointer was removed.
  #
  # Only treat backticked tokens as consumer names if a matching agent
  # file actually exists under $AGENTS_DIR/<name>.md — otherwise we'd
  # pick up incidental code-formatted prose like `eval()` or `0x...`.
  for ref_file in "$REFS_DIR"/secrets.md "$REFS_DIR"/injection.md "$REFS_DIR"/effect-cleanup.md "$REFS_DIR"/github-actions.md "$REFS_DIR"/skill-authoring.md; do
    ref_name=$(basename "$ref_file")
    consumers=$(awk '/^## Consumers/,EOF' "$ref_file" | grep -oE '`[a-z][a-z0-9-]*`' | tr -d '`' | sort -u)
    for c in $consumers; do
      [ -f "$AGENTS_DIR/$c.md" ] || continue
      grep -q "references/$ref_name" "$AGENTS_DIR/$c.md" 2>/dev/null \
        || { echo "$ref_file lists $c as consumer but $AGENTS_DIR/$c.md has no 'references/$ref_name' pointer" >&2; return 1; }
    done
  done
}

@test "install-prereqs.sh PREREQS list matches the setup skill's documented table" {
  # bin/install-prereqs.sh is the source of truth for what gets installed;
  # skills/setup/SKILL.md documents the same set in its table. The two have
  # drifted before (header said 5, list had 18) — lock them together.
  installer_names=$(sed -n "/^PREREQS=/,/'\$/p" "$PLUGIN_DIR/bin/install-prereqs.sh" | sed "s/^PREREQS='//" | awk 'NF{print $1}' | sort -u)
  setup_names=$(grep -oE '^\| `[a-z0-9-]+`' "$SKILLS_DIR/setup/SKILL.md" | tr -d '|` ' | sort -u)
  [ -n "$installer_names" ] || { echo "could not extract PREREQS names from install-prereqs.sh" >&2; return 1; }
  [ -n "$setup_names" ]     || { echo "could not extract table names from setup/SKILL.md" >&2; return 1; }
  diff <(printf '%s\n' "$installer_names") <(printf '%s\n' "$setup_names") \
    || { echo "PREREQS list and setup table disagree (see diff above)" >&2; return 1; }
}

@test "hooks.json and install-prereqs.sh exist and are wired up" {
  [ -f "$PLUGIN_DIR/hooks/hooks.json" ]
  [ -x "$PLUGIN_DIR/bin/install-prereqs.sh" ]
  run jq -e '.hooks.SessionStart' "$PLUGIN_DIR/hooks/hooks.json"
  [ "$status" -eq 0 ]
  # Assert the command content, not just key presence: a typo'd script path
  # or dropped backgrounding fails silently at runtime (prereqs never install,
  # personas quietly degrade).
  cmd=$(jq -re '.hooks.SessionStart[0].hooks[0].command' "$PLUGIN_DIR/hooks/hooks.json")
  [[ "$cmd" == *'bin/install-prereqs.sh'* ]] || { echo "hook command does not reference install-prereqs.sh: $cmd" >&2; return 1; }
  [[ "$cmd" == *'&' ]] || { echo "hook command is not backgrounded (must end in &): $cmd" >&2; return 1; }
}

@test "install-prereqs.sh lock: skips while a fresh lock is held" {
  # A fresh (sub-TTL) lock means another run is active: the script must
  # exit 0 without installing and without touching the holder's lock.
  STUB="$BATS_TEST_TMPDIR/bin"; mkdir -p "$STUB"
  printf '#!/bin/sh\nexit 1\n' > "$STUB/npx"; chmod +x "$STUB/npx"
  TMP="$BATS_TEST_TMPDIR/tmp"; LOCK="$TMP/claude-facets-install-prereqs.$(id -u).lock"
  mkdir -p "$LOCK"

  TMPDIR="$TMP" VERBOSE=1 PATH="$STUB:$PATH" run "$PLUGIN_DIR/bin/install-prereqs.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"another install-prereqs run is active"* ]] || { echo "missing skip message: $output" >&2; return 1; }
  [ -d "$LOCK" ] || { echo "active holder's lock was removed" >&2; return 1; }
}

@test "install-prereqs.sh lock: reclaims an expired lock and releases on exit" {
  # A lock older than the 60-min TTL (crashed holder — SIGKILL runs no trap)
  # must be reclaimed, and the EXIT trap must release the new lock afterwards.
  # Stub npx fails fast: the run is hermetic (no network), exercising the
  # full lock lifecycle. touch -t is POSIX (works on macOS BSD touch too).
  STUB="$BATS_TEST_TMPDIR/bin"; mkdir -p "$STUB"
  printf '#!/bin/sh\nexit 1\n' > "$STUB/npx"; chmod +x "$STUB/npx"
  TMP="$BATS_TEST_TMPDIR/tmp"; LOCK="$TMP/claude-facets-install-prereqs.$(id -u).lock"
  mkdir -p "$LOCK"
  touch -t 202001010000 "$LOCK"   # far past TTL

  TMPDIR="$TMP" VERBOSE=1 PATH="$STUB:$PATH" run "$PLUGIN_DIR/bin/install-prereqs.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"reclaiming stale lock"* ]] || { echo "expired lock was not reclaimed: $output" >&2; return 1; }
  [ ! -d "$LOCK" ] || { echo "lock not released on exit" >&2; return 1; }
}

@test "install-prereqs.sh lock: SIGTERM terminates the run and releases the lock" {
  # Regression guard for the signal-exit invariant: a non-exiting INT/TERM
  # handler would delete the lock and keep installing (mutex defeated, then
  # a double-free of the next holder's lock). Hermetic: HOME override makes
  # every skill "missing" so the script blocks inside the slow npx stub —
  # bash runs the signal trap after the foreground stub returns (~2s).
  STUB="$BATS_TEST_TMPDIR/bin"; mkdir -p "$STUB"
  printf '#!/bin/sh\nsleep 2\nexit 1\n' > "$STUB/npx"; chmod +x "$STUB/npx"
  TMP="$BATS_TEST_TMPDIR/tmp"; mkdir -p "$TMP"
  FAKEHOME="$BATS_TEST_TMPDIR/home"; mkdir -p "$FAKEHOME"
  LOCK="$TMP/claude-facets-install-prereqs.$(id -u).lock"

  TMPDIR="$TMP" HOME="$FAKEHOME" VERBOSE=0 PATH="$STUB:$PATH" \
    "$PLUGIN_DIR/bin/install-prereqs.sh" & SCRIPT_PID=$!
  for _ in $(seq 1 50); do [ -d "$LOCK" ] && break; sleep 0.1; done
  [ -d "$LOCK" ] || { echo "script never acquired the lock" >&2; return 1; }

  kill -TERM "$SCRIPT_PID"
  sig_status=0
  wait "$SCRIPT_PID" || sig_status=$?   # || keeps bats' errexit from tripping on 143
  [ "$sig_status" -eq 143 ] || { echo "expected exit 143 after SIGTERM, got $sig_status (handler did not exit?)" >&2; return 1; }
  [ ! -d "$LOCK" ] || { echo "lock not released by the EXIT trap on the signal path" >&2; return 1; }
}

@test "no install.sh remaining at repo root" {
  [ ! -f "$REPO_ROOT/install.sh" ]
}

@test "local plugin-dir smoke install (skipped if claude CLI absent)" {
  command -v claude >/dev/null 2>&1 || skip "claude CLI not on PATH"

  # Non-interactive smoke: load the plugin and ask Claude to list skills.
  # The 13 model-invokable skills should appear; `setup` is intentionally
  # disable-model-invocation: true and may not appear in the listing.
  # `</dev/null` is required: claude waits on stdin otherwise.
  run claude --plugin-dir "$PLUGIN_DIR" -p "List the plugin slash commands you can see. Just print their names." </dev/null 2>&1
  if [ "$status" -ne 0 ]; then
    # Disambiguate before failing: in some environments (CI, sandboxes that
    # pass auth via an inherited file descriptor bats doesn't preserve) the
    # CLI exists but can't authenticate at all. Probe without the plugin —
    # if that also fails, it's the environment, not the plugin shape: skip.
    # Probing only on failure keeps the happy path at one model invocation.
    smoke_output="$output"
    run claude -p "Say OK" </dev/null 2>&1
    [ "$status" -ne 0 ] && skip "claude CLI present but not usable here (auth/network): $output"
    echo "plugin-dir smoke failed but bare claude works — plugin shape problem: $smoke_output" >&2
    return 1
  fi
  echo "$output" | grep -q "facets:pr-switch"
  echo "$output" | grep -q "facets:pr-fix"
  echo "$output" | grep -q "facets:pr-review-gh"
  echo "$output" | grep -q "facets:pr-review-local"
  echo "$output" | grep -q "facets:pr-create"
  echo "$output" | grep -q "facets:convert-tib-to-linear"
  echo "$output" | grep -q "facets:tib-create"
  echo "$output" | grep -q "facets:tip-create"
  echo "$output" | grep -q "facets:tib-ship"
  echo "$output" | grep -q "facets:ts-conventions"
  echo "$output" | grep -q "facets:inject-wallet"
  echo "$output" | grep -q "facets:feedback"
  echo "$output" | grep -q "facets:implement-feedback"
}
