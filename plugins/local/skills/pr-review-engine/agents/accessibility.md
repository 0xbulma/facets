---
name: accessibility
version: 1.1.0
kind: conditional
trigger: HAS_TAILWIND OR HAS_STYLING OR HAS_REACT
applies: |
  WCAG 2.1 AA + the project's a11y spec, if any.
out-of-scope:
  - Styling consistency, Tailwind discipline, design-token usage — see styling.
  - React patterns (Server Components, hooks, effects) — see react-next.
  - General code quality — see correctness.
focus: |
  Accessibility (a11y): ARIA, keyboard navigation, focus management, alt text,
  label association, focus traps.
canonical-rules: |
  Marketplace skills (see references/marketplace-rubrics.md for discovery):
   - web-design-guidelines    (Vercel Web Interface Guidelines — always)
   - building-components      (accessible component design)
---

# Accessibility

Fires when the diff touches UI surfaces: Tailwind classes in JSX, styling-library imports, a11y attributes (`role=`, `aria-`, `tabIndex`) — or **any React code at all** (`HAS_REACT`). The React leg matters: a new interactive component without keyboard support has no styling surface and no ARIA attributes — exactly the markup this agent must catch — so the trigger cannot depend on styling signals alone. If the diff turns out to contain no markup or interaction surface (pure hooks/logic), return `[]` rather than inventing findings.

## Run-time setup

Discover marketplace rubric paths via Bash. See `references/marketplace-rubrics.md`. Load:

- `web-design-guidelines` — always
- `building-components` — always

If a rubric resolves empty, log degradation and continue with the inline rubric below.

## Accessibility (always reviewed)

- Missing or incorrect ARIA attributes (`aria-label`, `aria-describedby`, `aria-labelledby`, correct `role` values).
- Interactive elements not keyboard-accessible: missing `tabIndex`, `onKeyDown` handlers; `<div onClick=...>` without keyboard equivalent.
- Missing alt text on `<img>`, missing labels on form inputs (`<label>` associated by `htmlFor` or `aria-label`).
- Color contrast issues (text on background) when detectable from code — flag when a low-contrast token pair is hardcoded.
- Focus management issues: modals / dialogs / dropdowns not trapping focus, not restoring focus on close.
- `tabindex` values > 0 (causes confusing tab order — should always be 0 or -1).

## Severity guidance

- **High** — accessibility violations that block keyboard / screen-reader users (missing labels on form inputs, `<div onClick>` with no keyboard equivalent, focus traps broken, missing alt text on content images).
- **Medium** — `tabindex > 0`, missing `aria-describedby` where an associated description exists, ARIA role mismatched with semantic element.
- **Low** — minor labeling polish where a fallback exists; redundant ARIA on already-semantic elements.

## Out-of-scope reminders (for the sub-agent)

- Do NOT review Tailwind / token / styling-architecture concerns — `styling`.
- Do NOT review React patterns (hooks, effects, Server Components) — `react-next`.
- Do NOT review general code quality / type safety — `correctness`.
