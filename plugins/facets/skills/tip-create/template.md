# TIP-__DATE__: __TITLE__

| Field              | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| **Status**         | Draft \| Approved \| In Progress \| Shipped                                    |
| **Date**           | __DATE__                                                                       |
| **Author**         | __AUTHOR__                                                                     |
| **Related TIB(s)** | __TIB_LINKS__                                                                  |
| **Sibling TIP(s)** | __SIBLING_TIP_LINKS__                                                          |
| **Scope**          | Repo-wide \| App: [name] \| Package: [name]                                    |

> Before implementing, read `CLAUDE.md` / `AGENTS.md` for repo conventions.
> A **TIP** is *mutable* — update as implementation progresses.
> Paired **TIB(s)** record the decision and stay frozen post-acceptance.
> A single TIB can have multiple TIPs (slices); a single TIP may cite multiple TIBs.
> The **Sibling TIP(s)** row is maintained automatically by `tip-create`.

---

## Context

Why this change is needed. What problem does it solve? Link to issue/TIB if applicable.

_If `--tib` was passed at scaffold time, this section is pre-populated from the TIB's Context. With multiple TIBs, content appears under per-TIB sub-headings._

## Overview

One-paragraph description of the feature or change from a user/system perspective.

## Goals & Non-Goals

### Goals

- [Specific, measurable outcome this TIP delivers]

### Non-Goals

- [Explicitly out of scope for this TIP]

_Pre-populated from the TIB(s) if `--tib` was passed._

## Technical Design

### Architecture

High-level architecture. How does this fit into the existing system? Include diagrams if helpful.

### Key Components

| Component       | Purpose          | Location          |
| --------------- | ---------------- | ----------------- |
| [ComponentName] | [What it does]   | `path/to/file.ts` |

### Interfaces & Types

```ts
// Key interfaces, types, or function signatures
interface ExampleProps {
  // ...
}
```

### Dependencies

- [External package, e.g. `@tanstack/react-query`]
- [Internal module, e.g. `@/hooks/useThing`]

## Files to Modify

### New Files

| File                       | Purpose       |
| -------------------------- | ------------- |
| `path/to/NewComponent.tsx` | [Description] |

### Modified Files

| File                  | Changes        |
| --------------------- | -------------- |
| `path/to/existing.ts` | [What changes] |

## Implementation Steps

Each phase below follows a **test-driven block loop**. Do not advance to the next phase until every checkbox in the current phase's *Block validation* sub-section is green. `/facets:tib-ship` automates this loop; humans running it manually should follow the same order.

**The block loop, in order:**

1. **Tests first (red):** write or extend the gating tests so they fail meaningfully against the current code.
2. **Implement (green):** make the smallest change that turns the gating tests green.
3. **Format:** `__FORMAT_CMD__` (auto-applies).
4. **Lint:** `__LINT_CMD__` (auto-fix what's fixable, address the rest).
5. **Typecheck:** `__TYPECHECK_CMD__`.
6. **Tests:** `__TEST_CMD__` — gating tests plus any suite the change touches.
7. **Commit:** conventional commit (`feat(<scope>): <phase name>`), only when steps 3–6 are clean.

### Phase 1 — [name]

**Tests gating this phase** (red before implementation):

- [ ] `path/to/Feature.test.ts` — [What this test asserts; must fail against the current code]

**Implementation** (turn the gating tests green):

- [ ] **File**: `path/to/file.ts` — [Specific change]
- [ ] **File**: `path/to/file2.ts` — [Specific change]

**Block validation** (each must pass before moving to Phase 2):

- [ ] `__FORMAT_CMD__` applied
- [ ] `__LINT_CMD__` clean
- [ ] `__TYPECHECK_CMD__` clean
- [ ] `__TEST_CMD__` green (including the gating tests above)
- [ ] Commit: `feat(<scope>): <phase name>`

### Phase 2 — [name]

**Tests gating this phase:**

- [ ] `path/to/...test.ts` — [Behavior under test]

**Implementation:**

- [ ] **File**: `path/to/file.ts` — [Specific change]

**Block validation:**

- [ ] `__FORMAT_CMD__` applied
- [ ] `__LINT_CMD__` clean
- [ ] `__TYPECHECK_CMD__` clean
- [ ] `__TEST_CMD__` green
- [ ] Commit: `feat(<scope>): <phase name>`

### Phase 3 — [name]

**Tests gating this phase:**

- [ ] `path/to/...test.ts` — [Behavior under test]

**Implementation:**

- [ ] **File**: `path/to/file.ts` — [Specific change]

**Block validation:**

- [ ] `__FORMAT_CMD__` applied
- [ ] `__LINT_CMD__` clean
- [ ] `__TYPECHECK_CMD__` clean
- [ ] `__TEST_CMD__` green
- [ ] Commit: `feat(<scope>): <phase name>`

_Add or remove phases as needed. Each phase should be a coherent, shippable slice. Each phase must include all three sub-sections (Tests / Implementation / Block validation) — they are the per-block contract `tib-ship` enforces._

## Testing Strategy

### Unit Tests

| Test File                          | What to Test         |
| ---------------------------------- | -------------------- |
| `path/__tests__/Component.test.ts` | [Specific behaviors] |

### Integration / E2E Tests

- [ ] [User flow or integration to test]

## Risks & Mitigations

| Risk               | Impact            | Mitigation        |
| ------------------ | ----------------- | ----------------- |
| [Risk description] | [High/Medium/Low] | [How to mitigate] |

## References

- __TIB_LINKS__
- [Related TIP or PR](url)
- [Similar existing code: `path/to/similar.ts`]

## Open Questions

- [ ] [Question to resolve before / during implementation]

## Acceptance Criteria

- [ ] [Specific, testable criterion]
- [ ] [User-facing behavior that must work]

## Verification Checklist

> Commands below are auto-detected at scaffold time from `package.json` scripts.
> Anything not detected is left as a bare script name — fill in or remove.
> Order matches the per-block loop: format settles the code → lint cleans patterns → types verify shapes → tests verify behavior → build confirms shippability.

- [ ] Formatting applied (`__FORMAT_CMD__`)
- [ ] Lint clean (`__LINT_CMD__`)
- [ ] Typecheck clean (`__TYPECHECK_CMD__`)
- [ ] Tests green (`__TEST_CMD__`)
- [ ] Build succeeds (`__BUILD_CMD__`)
- [ ] New gating tests added for every new behavior
- [ ] Manual / runtime testing completed (or `runtime-validation` persona ran clean)
- [ ] Documentation updated (if applicable)
- [ ] No console errors in the browser (for UI changes)

<!--
TIP conventions:
- A TIP is *mutable*. Update as implementation progresses.
- Paired TIB(s) record the decision and stay frozen post-acceptance.
- A single TIB can have multiple TIPs (slices); a single TIP may cite multiple TIBs.
- TIP filenames are CalVer-prefixed: `TIP-YYYY-MM-DD-<slug>.md`.
- When the work ships, set Status to "Shipped" and link the merged PR(s) under References.
- To list all TIPs for a given TIB: `grep -l "TIB-YYYY-MM-DD" docs/tips/`.
-->
