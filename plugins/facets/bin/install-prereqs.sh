#!/usr/bin/env bash
#
# install-prereqs.sh — idempotently install the prereq rubric skills used by
# the local conditional personas. The PREREQS list below is the source of
# truth for what gets installed; skills/setup/SKILL.md documents the same set.
#
# Safe to run repeatedly. Each skill is only fetched if not already present
# at ~/.claude/skills/<name>/SKILL.md.
#
# Invoked by:
#   - SessionStart hook (silent, background)
#   - /facets:setup skill (manual, verbose)
#
# Skill source: vercel-labs/agent-skills + addyosmani/web-quality-skills +
#               wshobson/agents (skills.sh registry).
#

set -u  # do NOT set -e — we want to keep trying other skills if one fails
VERBOSE="${VERBOSE:-0}"

log() { [ "$VERBOSE" = "1" ] && echo "[local setup] $*" >&2; return 0; }

# Single-instance lock. The SessionStart hook backgrounds this script, so two
# sessions starting close together would otherwise run duplicate npx installs
# in parallel (both pass the per-skill existence check before either finishes).
# mkdir is atomic and portable (no flock on macOS). Staleness is TTL-only: a
# lock older than 60 minutes (crashed / SIGKILLed holder — no trap runs on
# SIGKILL) is reclaimed by atomically renaming it away, so exactly one
# contender can win the reclaim; everyone else skips. Worst case after a
# crash: installs are delayed one TTL, then self-heal.
# Per-user lock name: on Linux TMPDIR is usually unset, so a fixed name in
# the shared /tmp would contend across users — and /tmp's sticky bit makes
# another user's stale lock unreclaimable (mv fails for non-owners).
LOCKDIR="${TMPDIR:-/tmp}/claude-facets-install-prereqs.$(id -u).lock"
acquire_lock() {
  mkdir "$LOCKDIR" 2>/dev/null && return 0
  if [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    log "reclaiming stale lock (older than 60 min)"
    # Atomic claim: only one racer's mv of a given inode succeeds.
    mv "$LOCKDIR" "$LOCKDIR.stale.$$" 2>/dev/null || return 1
    # TOCTOU guard: between our staleness check and our mv, a faster racer
    # may have reclaimed and re-created the lock — in which case we just
    # renamed THEIR fresh lock, not the stale one. Re-verify on the moved
    # dir: if it's fresh, hand it back (or drop our copy if the path was
    # re-taken meanwhile) and skip.
    if [ -z "$(find "$LOCKDIR.stale.$$" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
      mv "$LOCKDIR.stale.$$" "$LOCKDIR" 2>/dev/null || rm -rf "$LOCKDIR.stale.$$"
      return 1
    fi
    rm -rf "$LOCKDIR.stale.$$"
    mkdir "$LOCKDIR" 2>/dev/null && return 0
  fi
  return 1
}
if ! acquire_lock; then
  log "another install-prereqs run is active — skipping"
  exit 0
fi
# Cleanup exactly once, via EXIT; signal traps must terminate (a non-exiting
# signal handler would resume the script after deleting the lock).
trap 'rm -rf "$LOCKDIR" 2>/dev/null' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Bail out gracefully if the user has no npx (no Node).
if ! command -v npx >/dev/null 2>&1; then
  log "npx not on PATH — skipping prereq install. Skills will degrade to inline rubrics."
  exit 0
fi

# Each line: <installed-skill-name-under-~/.claude/skills/> <owner/repo@skill-name>
# Most install names match the @skill-name; a few differ where upstream renamed.
PREREQS='vercel-react-best-practices       vercel-labs/agent-skills@vercel-react-best-practices
vercel-composition-patterns       vercel-labs/agent-skills@vercel-composition-patterns
vercel-react-native-skills        vercel-labs/agent-skills@vercel-react-native-skills
next-best-practices               vercel-labs/next-skills@next-best-practices
next-cache-components             vercel-labs/next-skills@next-cache-components
turborepo                         vercel/turborepo@turborepo
ai-sdk                            vercel/ai@ai-sdk
ai-elements                       vercel/ai-elements@ai-elements
streamdown                        vercel/streamdown@streamdown
web-design-guidelines             vercel-labs/agent-skills@web-design-guidelines
building-components               vercel/components.build@building-components
agent-browser                     vercel-labs/agent-browser@agent-browser
deploy-to-vercel                  vercel-labs/agent-skills@deploy-to-vercel
vercel-cli-with-tokens            vercel-labs/agent-skills@vercel-cli-with-tokens
find-skills                       vercel-labs/skills@find-skills
before-and-after                  vercel-labs/before-and-after@before-and-after
tailwind-design-system            wshobson/agents@tailwind-design-system'

installed=0
skipped=0
failed=0

while IFS=' ' read -r name pkg; do
  [ -z "$name" ] && continue
  target="$HOME/.claude/skills/$name/SKILL.md"
  if [ -e "$target" ]; then
    log "✓ $name (already installed)"
    skipped=$((skipped + 1))
    continue
  fi
  log "→ installing $name from $pkg"
  if npx --yes skills add "$pkg" -g -y </dev/null >/dev/null 2>&1; then
    log "✓ $name installed"
    installed=$((installed + 1))
  else
    log "✗ $name install failed (continuing)"
    failed=$((failed + 1))
  fi
done <<< "$PREREQS"

log "summary: $installed installed, $skipped skipped, $failed failed"

# Always exit 0 — prereq install is best-effort. A failure should not block
# the user's session or their /facets:setup invocation.
exit 0
