#!/usr/bin/env bats
#
# Validates the Codex skill and Claude Code plugin marketplace.
# Run: bats test/plugin.bats
#
# Install bats with: brew install bats-core
#

frontmatter_value() {
  key="$1"
  file="$2"
  awk -v key="$key" 'NR == 1 && /^---$/{f=1; next} f && /^---$/{exit} f && $0 ~ "^" key ":" {sub("^" key ":[[:space:]]*", ""); print; exit}' "$file"
}

# Fail loudly on a version that could not be read. `git show` of a missing blob
# piped into `jq` yields an empty string with exit 0, and semver_gt coerces ""
# (and a literal "null") to 0 — which would silently pass the version guard over
# this repo's most-emphasized footgun (an unbumped plugin.json).
require_semver() {
  case "$1" in
    [0-9]*.[0-9]*.[0-9]*) return 0 ;;
    *) echo "could not read a semver for $2 (got: '$1')" >&2; return 1 ;;
  esac
}

semver_gt() {
  awk -v new="$1" -v old="$2" 'BEGIN {
    split(new, n, "."); split(old, o, ".")
    for (i = 1; i <= 3; i++) {
      sub(/[^0-9].*$/, "", n[i]); sub(/[^0-9].*$/, "", o[i])
      if ((n[i] + 0) > (o[i] + 0)) exit 0
      if ((n[i] + 0) < (o[i] + 0)) exit 1
    }
    exit 1
  }'
}

setup() {
  # Resolve repo root from this test file's location.
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  CODEX_MARKETPLACE="$REPO_ROOT/.agents/plugins/marketplace.json"
  CODEX_PLUGIN_MANIFEST="$REPO_ROOT/.codex-plugin/plugin.json"
  CODEX_SKILL="$REPO_ROOT/skills/facets/SKILL.md"
  CODEX_REFS="$REPO_ROOT/skills/facets/references"
  CODEX_SETUP="$REPO_ROOT/plugins/facets/bin/install-prereqs.sh"
  MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
  PLUGIN_DIR="$REPO_ROOT/plugins/facets"
  PLUGIN_MANIFEST="$PLUGIN_DIR/.claude-plugin/plugin.json"
  SKILLS_DIR="$PLUGIN_DIR/skills"
  AGENTS_DIR="$SKILLS_DIR/pr-review-engine/agents"
  # Every directory whose contents ship to a user. The leaked-content guards
  # below must cover the Codex surface as well as the Claude plugin.
  SHIPPED_DIRS="$PLUGIN_DIR $REPO_ROOT/skills/facets $REPO_ROOT/.codex-plugin $REPO_ROOT/.agents"
  # Derive from skill DIRECTORIES, not from */SKILL.md: globbing the SKILL.md
  # files would make the "every skill dir has a SKILL.md" test below tautological
  # (and silently drop a skill that lost its SKILL.md from every downstream test).
  SKILLS_ALL=$(for skill_dir in "$SKILLS_DIR"/*/; do basename "$skill_dir"; done | sort)
}

@test "Codex manifests are valid JSON" {
  run jq empty "$CODEX_PLUGIN_MANIFEST" "$CODEX_MARKETPLACE"
  [ "$status" -eq 0 ]
}

@test "Codex marketplace installs the root facets plugin" {
  run jq -e '
    .name == "facets" and any(.plugins[];
      .name == "facets" and
      .source.source == "url" and
      .source.url == "https://github.com/0xbulma/facets.git" and
      .source.ref == "main" and
      .policy.installation == "AVAILABLE" and
      .policy.authentication == "ON_INSTALL" and
      .category == "Developer Tools"
    )
  ' "$CODEX_MARKETPLACE"
  [ "$status" -eq 0 ]
}

@test "Codex plugin exposes one concise full-suite facets router" {
  run jq -e '
    .name == "facets" and
    (.version | test("^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$")) and
    (.description | length > 0) and
    (.author.name | length > 0) and
    .skills == "./skills/" and
    .interface.displayName == "Facets" and
    (.interface.shortDescription | length > 0) and
    (.interface.longDescription | length > 0) and
    (.interface.developerName | length > 0) and
    (.interface.category | length > 0) and
    (.interface.capabilities | type == "array") and
    (.interface.defaultPrompt | length > 0)
  ' "$CODEX_PLUGIN_MANIFEST"
  [ "$status" -eq 0 ]

  [ -f "$CODEX_SKILL" ]
  [ -f "$REPO_ROOT/AGENTS.md" ]
  grep -Fq 'CLAUDE.md' "$REPO_ROOT/AGENTS.md"
  [ "$(find "$REPO_ROOT/skills" -name SKILL.md -type f | wc -l | tr -d ' ')" = "1" ]
  [ "$(awk '/^---$/{f=!f; next} f && /^name:/{print $2; exit}' "$CODEX_SKILL")" = "facets" ]
  [ "$(awk 'NR == 1 && /^---$/{f=1; next} f && /^---$/{exit} f && /^[a-z-]+:/{print $1}' "$CODEX_SKILL" | tr -d ':' | sort | tr '\n' ' ' | sed 's/ $//')" = "description name" ]
  [ "$(wc -w < "$CODEX_SKILL" | tr -d ' ')" -le 500 ]

  linked_refs=$(grep -oE 'references/[a-z0-9-]+\.md' "$CODEX_SKILL" | sort -u)
  disk_refs=$(find "$CODEX_REFS" -maxdepth 1 -name '*.md' -type f -exec basename {} \; | sed 's#^#references/#' | sort)
  diff <(printf '%s\n' "$linked_refs") <(printf '%s\n' "$disk_refs") \
    || { echo "Codex router references and files disagree" >&2; return 1; }
  [ -f "$CODEX_SETUP" ]
  run bash -n "$CODEX_SETUP"
  [ "$status" -eq 0 ]
  run grep -q 'npx --yes skills add.*-a "$FACETS_AGENT"' "$CODEX_SETUP"
  [ "$status" -eq 0 ]
  run grep -Fq '${CODEX_HOME:-$HOME/.codex}/skills/$name/SKILL.md' "$CODEX_SETUP"
  [ "$status" -eq 0 ]

  for skill_file in "$SKILLS_DIR"/*/SKILL.md; do
    route=$(basename "$(dirname "$skill_file")")
    [ "$(frontmatter_value user-invocable "$skill_file")" = "false" ] && continue
    run grep -Fq "\`$route\`" "$CODEX_SKILL"
    [ "$status" -eq 0 ] || { echo "missing Codex route: $route" >&2; return 1; }
  done
  run grep -q '\$facets' "$REPO_ROOT/skills/facets/agents/openai.yaml"
  [ "$status" -eq 0 ]
}

@test "Codex preserves critical port-specific review contracts" {
  review="$CODEX_REFS/review.md"
  review_engine="$SKILLS_DIR/pr-review-engine/SKILL.md"
  grep -Fq 'Enumerate every `*.md`' "$CODEX_REFS/review.md"
  grep -Fq 'one read-only reviewer per selected persona' "$CODEX_REFS/review.md"
  # Pin the concurrency cap, and that it is a sliding window rather than a wave
  # barrier (a barrier pays the slowest reviewer's tail once per wave).
  grep -Fq 'at most three in flight' "$CODEX_REFS/review.md"
  grep -Fq 'as soon as any reviewer returns' "$CODEX_REFS/review.md"
  grep -Fq '../../plugins/facets/skills/pr-review-engine/SKILL.md' "$review"
  grep -Fq 'final content of every reviewer prompt' "$review"
  grep -Fq 'Translate only Claude execution mechanics' "$review"

  for marker in \
    '**`line` schema.**' \
    '**`confidence` schema (advisory).**' \
    '**Stay in scope (avoid scope creep).**' \
    "**Don't nitpick.**" \
    "**Intentional changes aren't defects.**" \
    'A finding that would be **kept** (good shape):' \
    'A finding that would be **dropped** in Step 6 (bad shape):'
  do
    grep -Fq "$marker" "$review_engine" \
      || { echo "shared reviewer contract missing: $marker" >&2; return 1; }
  done

  for agent_file in "$AGENTS_DIR"/*.md; do
    trigger=$(awk '/^---$/{f=!f; next} f && /^trigger:/{sub(/^trigger: */,""); print; exit}' "$agent_file")
    [ -n "$trigger" ] || continue
    for flag in $(printf '%s\n' "$trigger" | grep -oE 'HAS_[A-Z0-9_]+' | sort -u); do
      grep -Fq -- "- \`$flag\`:" "$CODEX_REFS/review.md" \
        || { echo "Codex review missing trigger $flag from $(basename "$agent_file")" >&2; return 1; }
    done
  done

  grep -Fq 'keep maximum severity independently' "$CODEX_REFS/review.md"
  authoring_ref="$SKILLS_DIR/pr-review-engine/references/skill-authoring.md"
  grep -Fq 'Do not require a per-skill version' "$authoring_ref"
  grep -Fq '.codex-plugin/plugin.json' "$authoring_ref"
  run grep -Eq '^\| `implement-feedback` \| .*references/review\.md.*references/github\.md' "$CODEX_SKILL"
  [ "$status" -eq 0 ]
  run grep -Fq '**Fix watch:** never gate on head SHA.' "$CODEX_REFS/github.md"
  [ "$status" -eq 0 ]
  run grep -Fq 'RESULT_JSON` does not collect browser-console output or HTTP status' "$CODEX_REFS/wallet.md"
  [ "$status" -eq 0 ]
}

@test "Codex separates uncommitted and commit-authorized review loops" {
  review="$CODEX_REFS/review.md"
  grep -Fq '**Uncommitted variant (default):**' "$review"
  grep -Fq '**Commit-authorized variant:**' "$review"
  grep -Fq 'last-green snapshot' "$review"
  grep -Fq 'last green commit' "$review"
  grep -Fq 'Convergence requires no critical/high/medium findings and `FAILED_AGENTS == 0`' "$review"
  grep -Fq 'never call `gh` or read PR titles, bodies, comments' "$review"
  grep -Fq 'only after complete clean convergence' "$review"
}

@test "Codex tib-ship preserves acknowledged override flows" {
  planning="$CODEX_REFS/planning.md"
  grep -Fq 'require explicit confirmation to proceed' "$planning"
  grep -Fq 'reuse it, replace it, or choose another name' "$planning"
  grep -Fq 'ask whether to stop or proceed' "$planning"
  grep -Fq 'if it already passes' "$planning"
  grep -Fq 'extend, accept-and-continue with the branch marked not review-clean, or stop' "$planning"
  grep -Fq 'selecting its commit-authorized variant' "$planning"
  grep -Fq 'never uses the `pr-review-local --goal` GitHub/push exception' "$planning"
  grep -Fq 'Every green review-fix commit includes a `TIB: <TIB-ID>` trailer' "$planning"
}

@test "Codex preserves local feedback and conflict boundaries" {
  grep -Fq 'ask whether to skip (default) or append anyway' "$CODEX_REFS/feedback.md"
  grep -Fq 'never mix review-thread fixes into `MERGE_HEAD`' "$CODEX_REFS/github.md"
}

@test "Codex shared-asset references resolve from its router" {
  for rel in $(grep -rhoE '\.\./\.\./plugins/facets/[A-Za-z0-9._/*-]+' "$CODEX_SKILL" "$CODEX_REFS" | sort -u); do
    rel=${rel%\*}
    [ -e "$(dirname "$CODEX_SKILL")/$rel" ] \
      || { echo "missing Codex shared asset: $rel" >&2; return 1; }
  done
}

@test "Claude and Codex plugin versions move with their surfaces" {
  base=${FACETS_VERSION_BASE:-origin/main}
  git -C "$REPO_ROOT" rev-parse --verify "$base^{commit}" >/dev/null 2>&1 \
    || skip "version base unavailable: $base"

  changed=$(cd "$REPO_ROOT" && {
    git diff --name-only "$base"...HEAD
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | sort -u)

  if printf '%s\n' "$changed" | grep -Eq '^(\.codex-plugin/|\.agents/plugins/|skills/facets/|plugins/facets/)'; then
    if git -C "$REPO_ROOT" cat-file -e "$base:.codex-plugin/plugin.json" 2>/dev/null; then
      old=$(git -C "$REPO_ROOT" show "$base:.codex-plugin/plugin.json" | jq -r .version)
      new=$(jq -r .version "$CODEX_PLUGIN_MANIFEST")
      require_semver "$old" "Codex plugin base version at $base"
      require_semver "$new" "Codex plugin version"
      semver_gt "$new" "$old" || { echo "Codex plugin version must increase: $old -> $new" >&2; return 1; }
    fi
  fi

  if printf '%s\n' "$changed" | grep -q '^plugins/facets/'; then
    old=$(git -C "$REPO_ROOT" show "$base:plugins/facets/.claude-plugin/plugin.json" | jq -r .version)
    new=$(jq -r .version "$PLUGIN_MANIFEST")
    require_semver "$old" "Claude plugin base version at $base"
    require_semver "$new" "Claude plugin version"
    semver_gt "$new" "$old" || { echo "Claude plugin version must increase: $old -> $new" >&2; return 1; }
  fi

  for path in $changed; do
    case "$path" in
      plugins/facets/skills/*/SKILL.md|plugins/facets/skills/pr-review-engine/agents/*.md)
        git -C "$REPO_ROOT" cat-file -e "$base:$path" 2>/dev/null || continue
        old=$(git -C "$REPO_ROOT" show "$base:$path" | awk '/^---$/{f=!f; next} f && /^version:/{print $2; exit}')
        new=$(frontmatter_value version "$REPO_ROOT/$path")
        require_semver "$old" "$path base version at $base"
        require_semver "$new" "$path version"
        semver_gt "$new" "$old" || { echo "$path version must increase: $old -> $new" >&2; return 1; }
        ;;
    esac
  done
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

@test "every direct Claude skill directory has a SKILL.md" {
  for skill in $SKILLS_ALL; do
    [ -f "$SKILLS_DIR/$skill/SKILL.md" ] || { echo "missing $SKILLS_DIR/$skill/SKILL.md" >&2; return 1; }
  done
}

@test "public Claude route inventories match user-invocable skills" {
  expected=$(for skill in $SKILLS_ALL; do
    skill_file="$SKILLS_DIR/$skill/SKILL.md"
    [ "$(frontmatter_value user-invocable "$skill_file")" = false ] || echo "$skill"
  done | sort)

  for doc in "$REPO_ROOT/README.md" "$PLUGIN_DIR/README.md"; do
    actual=$(grep -oE '/facets:[a-z0-9-]+' "$doc" | sed 's#/facets:##' | sort -u)
    diff <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") \
      || { echo "$doc route inventory disagrees with skill frontmatter" >&2; return 1; }
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
  run grep -rn '@morpho-org' $SHIPPED_DIRS
  # grep returns 1 when no match — that's what we want.
  [ "$status" -ne 0 ]
}

@test "no leaked 'morpho' references anywhere in plugins/" {
  # Skills imported from morpho-org/sdks must be fully repo-agnostic.
  # No exceptions — including author/owner metadata.
  run grep -rni --exclude-dir=node_modules 'morpho' $SHIPPED_DIRS
  [ "$status" -ne 0 ]
}

@test "no leaked personal-name references in plugins/" {
  # Only the public 0xbulma handle is permitted.
  run grep -rn 'Benjamin A\|benjamin@' $SHIPPED_DIRS
  [ "$status" -ne 0 ]
}

@test "no leaked <HOME> template tokens in plugins/" {
  run grep -rn '<HOME>' $SHIPPED_DIRS
  [ "$status" -ne 0 ]
}

@test "no leaked /.agents/ absolute paths outside the shared installer" {
  # The installer intentionally detects Codex's global npx-skills location.
  # $REPO_ROOT/.agents is the Codex marketplace dir itself — scan it for the
  # other guards but exclude it here, where the pattern is the path literal.
  run grep -rn --exclude=install-prereqs.sh '/\.agents/' \
    "$PLUGIN_DIR" "$REPO_ROOT/skills/facets" "$REPO_ROOT/.codex-plugin"
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

@test "no hardcoded shared /tmp review-state paths in plugins/" {
  # The review engine + callers must allocate per-run temp paths with mktemp
  # (feedback #56): parallel Conductor workspaces share the host /tmp, so a
  # shared literal lets a concurrent review clobber the changed-lines map /
  # findings ledger feed / dropped audit mid-run. Per-run paths only.
  run grep -rn --exclude-dir=node_modules \
    -e '/tmp/changed-lines.json' \
    -e '/tmp/facets-findings.json' \
    -e '/tmp/pr-review-local-dropped.json' \
    -e '/tmp/facets:pr-review-gh-' \
    -e '/tmp/pr-review-gh-' \
    "$PLUGIN_DIR"
  # grep exits 1 when no match — that's what we want.
  [ "$status" -ne 0 ]
}

@test "documented persona counts match the filesystem" {
  count=$(find "$AGENTS_DIR" -maxdepth 1 -name '*.md' -type f | wc -l | tr -d ' ')
  baseline=$(for agent_file in "$AGENTS_DIR"/*.md; do [ "$(frontmatter_value kind "$agent_file")" = baseline ] && echo x; done | wc -l | tr -d ' ')
  conditional=$(for agent_file in "$AGENTS_DIR"/*.md; do [ "$(frontmatter_value kind "$agent_file")" = conditional ] && echo x; done | wc -l | tr -d ' ')

  for doc in "$REPO_ROOT/README.md" "$PLUGIN_DIR/README.md" "$REPO_ROOT/CLAUDE.md"; do
    grep -Eq "(^|[^0-9])${count}[- ](agent|reviewer)|${count} versioned reviewers" "$doc" \
      || { echo "$doc does not reflect $count personas" >&2; return 1; }
  done
  for doc in "$REPO_ROOT/README.md" "$REPO_ROOT/CLAUDE.md"; do
    grep -Fq "$baseline baseline + $conditional conditional" "$doc" \
      || { echo "$doc does not reflect $baseline baseline + $conditional conditional" >&2; return 1; }
  done
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

@test "pr-fix fix-rubric discovery matches persona bodies" {
  expected=$(grep -l '^## Fix rubric$' "$AGENTS_DIR"/*.md \
             | xargs -n1 basename \
             | sed 's/\.md$//' \
             | sort | tr '\n' ' ' | sed 's/ $//')
  # Pin the set explicitly as well: `expected` is the script's own algorithm, so
  # comparing the two alone can only prove the script agrees with itself. The pin
  # is what forces a deliberate test update when a `## Fix rubric` section is
  # added or removed — i.e. when pr-fix's auto-apply surface changes.
  [ "$expected" = "ci-security dependencies docs release-integrity web3" ] \
    || { echo "fix-rubric persona set changed: $expected" >&2; return 1; }
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

@test "engine ships scripts/ with the five bundled helpers" {
  # The Anthropic Skills guide (p. 26) recommends scripting deterministic
  # logic instead of expressing it only in language. The five helpers
  # implement the diff-line build (TS), the finding validator (TS), the
  # findings-ledger merge for stateful re-runs (TS, feedback #19), the
  # git-scope helpers extracted from inline bash (TS, feedback #31), and the
  # fix-rubric agent discovery (bash) — locking the file list catches a future
  # edit that removes any of them.
  SCRIPTS_DIR="$SKILLS_DIR/pr-review-engine/scripts"
  [ -x "$SCRIPTS_DIR/build-changed-lines.ts" ]   || { echo "missing/non-executable: build-changed-lines.ts" >&2; return 1; }
  [ -x "$SCRIPTS_DIR/validate-findings.ts" ]     || { echo "missing/non-executable: validate-findings.ts" >&2; return 1; }
  [ -x "$SCRIPTS_DIR/findings-ledger.ts" ]       || { echo "missing/non-executable: findings-ledger.ts" >&2; return 1; }
  [ -x "$SCRIPTS_DIR/review-scope.ts" ]          || { echo "missing/non-executable: review-scope.ts" >&2; return 1; }
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

@test "engine and setup have distinct Claude invocation controls" {
  # Both block automatic model invocation. Only the directly-read engine is
  # hidden from the user menu; setup remains a user-invocable route.
  for skill in pr-review-engine setup; do
    flag=$(awk '/^---$/{f=!f; next} f && /^disable-model-invocation:/{print $2; exit}' "$SKILLS_DIR/$skill/SKILL.md")
    [ "$flag" = "true" ] || { echo "$skill/SKILL.md missing disable-model-invocation: true (got: $flag)" >&2; return 1; }
  done
  [ "$(frontmatter_value user-invocable "$SKILLS_DIR/pr-review-engine/SKILL.md")" = "false" ]
  [ "$(frontmatter_value user-invocable "$SKILLS_DIR/setup/SKILL.md")" != "false" ]
}

@test "Claude authoring detector covers Codex surfaces" {
  engine="$SKILLS_DIR/pr-review-engine/SKILL.md"
  persona="$AGENTS_DIR/skill-authoring.md"
  for token in '.codex-plugin/plugin.json' '.agents/plugins/marketplace.json' 'agents/openai.yaml'; do
    grep -Fq "$token" "$engine" || { echo "engine detector missing $token" >&2; return 1; }
    grep -Fq "$token" "$persona" || { echo "authoring persona missing $token" >&2; return 1; }
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
  for token in GOAL_CLEAN GOAL_INCOMPLETE GOAL_ABORTED GOAL_STUCK GOAL_MAXED GOAL_RUNTIME_RED; do
    grep -q "$token" "$skill" || { echo "pr-review-local missing $token sentinel" >&2; return 1; }
  done
  for flag in --goal --max-iters --no-runtime; do
    grep -q -- "$flag" "$skill" || { echo "pr-review-local missing $flag flag" >&2; return 1; }
  done
}

@test "pr-review-local never treats a failed-agent review as clean (feedback #45)" {
  # feedback #45: a crashed agent must not be laundered into a clean pass via
  # two paths. (1) The --goal success check gates break-success on
  # FAILED_AGENTS == 0 and otherwise stops with GOAL_INCOMPLETE. (2) Step 6b
  # stamps the cache identity (--run-hash) ONLY when FAILED_AGENTS == 0, so a
  # REVIEW_INCOMPLETE run never cache-hits and replays as clean.
  # Anchor on the gate PHRASING, not the bare tokens: both 'GOAL_INCOMPLETE'
  # and 'FAILED_AGENTS' already appear unconditionally elsewhere (sentinel
  # tables, REVIEW_INCOMPLETE prose), so a bare-token grep would still pass a
  # regression that drops the success-check condition or the Step 6b guard.
  skill="$SKILLS_DIR/pr-review-local/SKILL.md"
  grep -q 'GOAL_INCOMPLETE' "$skill" \
    || { echo "pr-review-local --goal success check missing the GOAL_INCOMPLETE failed-agent guard" >&2; return 1; }
  grep -q 'FAILED_AGENTS == 0' "$skill" \
    || { echo "pr-review-local --goal success check missing the FAILED_AGENTS == 0 gate" >&2; return 1; }
  grep -q 'FAILED_AGENTS:-0' "$skill" \
    || { echo "pr-review-local Step 6b missing the cache-stamp guard (FAILED_AGENTS:-0 -eq 0)" >&2; return 1; }
}

@test "engine documents the merge-base recompute + merge-in-range warning (feedback #20)" {
  # feedback #20: recompute the merge-base each run (so a base-branch merge can't
  # inflate the diff) and warn when merge commits are in the review range. Lock
  # the detection so a future edit can't quietly drop the merge-noise guard.
  engine="$SKILLS_DIR/pr-review-engine/SKILL.md"
  grep -q 'MERGES_IN_RANGE' "$engine"       || { echo "engine missing the merge-in-range detection" >&2; return 1; }
  grep -q 'rev-list --merges' "$engine"     || { echo "engine missing the rev-list --merges count" >&2; return 1; }
}

@test "engine documents the INTENT_CONTEXT envelope input" {
  # feedback #25: the Step 5 envelope injects caller-supplied intent/history
  # (commit messages; PR body + prior comments for GitHub-aware callers) so
  # agents don't over-rate deliberate, documented changes. Lock the contract
  # token so a future edit can't drop the slot while leaving callers passing it.
  engine="$SKILLS_DIR/pr-review-engine/SKILL.md"
  grep -q 'INTENT_CONTEXT' "$engine" || { echo "engine missing INTENT_CONTEXT envelope input" >&2; return 1; }
}

@test "engine + pr-review-gh document the snapped_line posting contract" {
  # feedback #22: validate-findings tags each kept finding with snapped_line
  # (nearest diff line), and pr-review-gh must anchor inline comments on it so
  # the GitHub reviews API doesn't 422 the whole batch on one off-diff line.
  engine="$SKILLS_DIR/pr-review-engine/SKILL.md"
  gh="$SKILLS_DIR/pr-review-gh/SKILL.md"
  grep -q 'snapped_line' "$engine" || { echo "engine missing snapped_line output contract" >&2; return 1; }
  grep -q 'snapped_line' "$gh"     || { echo "pr-review-gh must anchor inline comments on snapped_line" >&2; return 1; }
}

@test "review skills document the SSH->HTTPS fetch + pnpm pre-run-install fallbacks (feedback #24)" {
  # feedback #24: a downed ssh-agent must not block a fetch (HTTPS fallback,
  # git-only so pr-review-local stays zero-GitHub), and pnpm's
  # verify-deps-before-run must not sink a lint/test gate on a native-build repo.
  local_skill="$SKILLS_DIR/pr-review-local/SKILL.md"
  gh="$SKILLS_DIR/pr-review-gh/SKILL.md"
  grep -q 'verify-deps-before-run' "$local_skill" || { echo "pr-review-local missing pnpm pre-run-install guard" >&2; return 1; }
  # Anchor on `remote.origin.url=` — the distinctive HTTPS-retry form unique to
  # the #24 fallback — not a bare URL (which pre-existing prose already matches).
  grep -q 'remote.origin.url=' "$local_skill" || { echo "pr-review-local missing SSH->HTTPS fetch fallback" >&2; return 1; }
  grep -q 'remote.origin.url=' "$gh"          || { echo "pr-review-gh missing SSH->HTTPS fetch fallback" >&2; return 1; }
}

@test "findings-ledger + pr-review-local document the idempotency cache (feedback #23)" {
  # feedback #23: an unchanged-input re-run short-circuits the agent panel via a
  # run-identity cache stored in the ledger. Lock the script mode + the Step 2c
  # wiring so a future edit can't quietly drop either half.
  ledger="$SKILLS_DIR/pr-review-engine/scripts/findings-ledger.ts"
  local_skill="$SKILLS_DIR/pr-review-local/SKILL.md"
  grep -q -- '--check-cache' "$ledger"   || { echo "findings-ledger.ts missing the --check-cache mode" >&2; return 1; }
  grep -q 'Idempotency cache' "$local_skill" || { echo "pr-review-local missing the Step 2c idempotency cache" >&2; return 1; }
  # feedback #32 (reshaped): goal mode stamps the ledger ONCE at convergence so a
  # later run inherits what --goal resolved — not per-iteration.
  grep -q 'Post-convergence ledger stamp' "$local_skill" \
    || { echo "pr-review-local goal mode missing the converge-time ledger stamp (#32)" >&2; return 1; }
}

@test "implement-feedback gates on relevance + desirability before implementing" {
  # A logged feedback issue is a proposal, not a work order — implement-feedback
  # must assess relevance/desirability (stale / superseded / conflicts / value)
  # and surface a proceed/reshape/skip verdict before branching, never blindly
  # implement. Lock the gate so a future edit can't drop it.
  skill="$SKILLS_DIR/implement-feedback/SKILL.md"
  grep -q 'Assess relevance and desirability' "$skill" \
    || { echo "implement-feedback missing the relevance/desirability gate" >&2; return 1; }
  for verdict in proceed reshape skip; do
    grep -q -- "**$verdict**" "$skill" || grep -qi "$verdict" "$skill" \
      || { echo "implement-feedback gate missing the '$verdict' verdict" >&2; return 1; }
  done
}

@test "pr-review-gh reuses a prior local review via the ledger, never a --post on local (feedback #21)" {
  # feedback #21 (reshaped): the local→post handoff is gh reading the branch-keyed
  # ledger pr-review-local wrote and posting without re-running the panel — NOT a
  # --post flag on the zero-GitHub local skill. Lock the reuse path + the no-flag stance.
  gh="$SKILLS_DIR/pr-review-gh/SKILL.md"
  local_skill="$SKILLS_DIR/pr-review-local/SKILL.md"
  grep -q 'Reuse a prior local review' "$gh" || { echo "pr-review-gh missing the local-review reuse path" >&2; return 1; }
  grep -q 'branch-' "$gh" || { echo "pr-review-gh reuse must read the branch-keyed ledger" >&2; return 1; }
  if grep -q -- '--post' "$local_skill"; then
    echo "pr-review-local must still NOT gain a --post flag (#21 reshaped to gh-side reuse)" >&2
    return 1
  fi
}

@test "pr-review-gh applies the PR-keyed findings ledger inside --watch cycles (feedback #46)" {
  # feedback #46: only the initial run applied the Step 6b ledger merge, so
  # --watch cycles reposted wontfix/seen findings every commit. Each watcher
  # cycle must now run the same pr<N>-keyed findings-ledger merge before posting
  # — drop suppressed (wontfix), tag net_new [NEW], best-effort fallback.
  gh="$SKILLS_DIR/pr-review-gh/SKILL.md"
  # The watcher Step 5b must invoke findings-ledger.ts against the cycle SHA.
  grep -q 'MERGE THE FINDINGS LEDGER' "$gh" \
    || { echo "pr-review-gh --watch cycle missing the Step 5b ledger merge (#46)" >&2; return 1; }
  grep -q -- '--head-sha ${CYCLE_HEAD_SHA}' "$gh" \
    || { echo "pr-review-gh watcher ledger merge must key on the cycle head SHA (#46)" >&2; return 1; }
  # Anchor on the Step 5b net_new instruction itself — a bare '\[NEW\]' also
  # matches Step 6 and the Notes bullet, so it would pass even if Step 5b's
  # tagging were deleted.
  grep -q 'Tag every net_new finding as \[NEW\]' "$gh" \
    || { echo "pr-review-gh watcher cycle must tag net_new findings as [NEW] (#46)" >&2; return 1; }
}

@test "pr-review-local never posts a review or opens a PR (push-to-existing-PR only)" {
  # feedback #21, reshaped again: posting stays in pr-review-gh. pr-review-local
  # must NOT gain a --post flag and must NEVER post a review or open a PR. The
  # original "Zero GitHub interaction" line was widened once --goal gained a
  # push: the loop now makes a read-only `gh` PR query and `git push`es the
  # converged commits to the branch's EXISTING open PR — but it still never
  # posts a review (no `gh pr review`/comments) and never opens one (no
  # `gh pr create`). Lock the surviving invariant, not the stale wording.
  skill="$SKILLS_DIR/pr-review-local/SKILL.md"
  grep -q 'never posts a review' "$skill" \
    || { echo "pr-review-local lost its 'never posts a review' contract line" >&2; return 1; }
  if grep -q -- '--post' "$skill"; then
    echo "pr-review-local must not gain a --post flag (feedback #21: posting stays in pr-review-gh)" >&2
    return 1
  fi
  if grep -q 'gh pr create' "$skill"; then
    echo "pr-review-local must never open a PR (gh pr create) — push-to-existing-PR only" >&2
    return 1
  fi
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
  for ref_file in $(grep -l '^## Consumers$' "$REFS_DIR"/*.md); do
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

@test "install-prereqs.sh host detection: codex finds a CODEX_HOME install" {
  # The FACETS_AGENT branch decides whether a prereq counts as already present.
  # Without this, flipping its `!=` or mis-nesting its brace groups still passes
  # bash -n + the two literal greps, and every session silently re-runs `npx
  # skills add` for all 17 prereqs (or never detects a Codex install at all).
  STUB="$BATS_TEST_TMPDIR/bin"; mkdir -p "$STUB"
  printf '#!/bin/sh\nexit 1\n' > "$STUB/npx"; chmod +x "$STUB/npx"
  FAKE_HOME="$BATS_TEST_TMPDIR/home"; CODEX="$FAKE_HOME/.codex"
  mkdir -p "$CODEX/skills/agent-browser"
  : > "$CODEX/skills/agent-browser/SKILL.md"
  mkdir -p "$BATS_TEST_TMPDIR/tmp-codex"   # the lock dir's parent must exist, or
                                       # mkdir fails and reads as "lock held"

  TMPDIR="$BATS_TEST_TMPDIR/tmp-codex" VERBOSE=1 PATH="$STUB:$PATH" \
    HOME="$FAKE_HOME" CODEX_HOME="$CODEX" FACETS_AGENT=codex \
    run "$PLUGIN_DIR/bin/install-prereqs.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"✓ agent-browser (already installed)"* ]] \
    || { echo "codex install not detected: $output" >&2; return 1; }
}

@test "install-prereqs.sh host detection: claude ignores a CODEX_HOME install" {
  # Same fixture, no FACETS_AGENT: the Claude branch must look only under
  # ~/.claude/skills, so the Codex copy must NOT count as present.
  STUB="$BATS_TEST_TMPDIR/bin"; mkdir -p "$STUB"
  printf '#!/bin/sh\nexit 1\n' > "$STUB/npx"; chmod +x "$STUB/npx"
  FAKE_HOME="$BATS_TEST_TMPDIR/home2"; CODEX="$FAKE_HOME/.codex"
  mkdir -p "$CODEX/skills/agent-browser"
  : > "$CODEX/skills/agent-browser/SKILL.md"
  mkdir -p "$BATS_TEST_TMPDIR/tmp-claude"   # the lock dir's parent must exist, or
                                       # mkdir fails and reads as "lock held"

  TMPDIR="$BATS_TEST_TMPDIR/tmp-claude" VERBOSE=1 PATH="$STUB:$PATH" \
    HOME="$FAKE_HOME" CODEX_HOME="$CODEX" \
    run "$PLUGIN_DIR/bin/install-prereqs.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"→ installing agent-browser"* ]] \
    || { echo "claude branch wrongly reused the codex install: $output" >&2; return 1; }
}

@test "install-prereqs.sh host detection: claude finds a ~/.claude install" {
  # The positive Claude path. Together with the two cases above this pins all
  # three arms, so flipping the branch's `!=`/`=` or mis-nesting its brace
  # groups fails at least one test rather than passing silently.
  STUB="$BATS_TEST_TMPDIR/bin"; mkdir -p "$STUB"
  printf '#!/bin/sh\nexit 1\n' > "$STUB/npx"; chmod +x "$STUB/npx"
  FAKE_HOME="$BATS_TEST_TMPDIR/home3"
  mkdir -p "$FAKE_HOME/.claude/skills/agent-browser"
  : > "$FAKE_HOME/.claude/skills/agent-browser/SKILL.md"
  mkdir -p "$BATS_TEST_TMPDIR/tmp-claude2"

  TMPDIR="$BATS_TEST_TMPDIR/tmp-claude2" VERBOSE=1 PATH="$STUB:$PATH" \
    HOME="$FAKE_HOME" run "$PLUGIN_DIR/bin/install-prereqs.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"✓ agent-browser (already installed)"* ]] \
    || { echo "claude install not detected: $output" >&2; return 1; }
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
