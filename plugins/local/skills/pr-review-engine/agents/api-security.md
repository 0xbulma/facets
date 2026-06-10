---
name: api-security
version: 0.1.0
kind: conditional
trigger: HAS_SERVER_API
applies: |
  The project's API / server security rules (look for AGENTS.md / CLAUDE.md
  sections on API routes, auth, and SECURITY.md). When the project has no
  codified rule, fall back to this persona's body.
out-of-scope:
  - Generic injection / eval / hardcoded secrets in source — see correctness (it owns the generic security primitives).
  - Error-handling depth (swallowed catch, missing error states) — see error-handling.
  - Client-side Web3 (contract calls, permits, wallet handling) — see web3.
  - Rate limiting / cost guards on AI endpoints specifically — see ai-sdk.
  - CI workflow security and publish-flow tokens — see ci-security, release-integrity.
  - Server/client component boundaries and NEXT_PUBLIC_ env leaks to the client bundle — see react-next.
focus: |
  The server-side trust boundary: authn/authz on API routes and server
  actions, input validation at the boundary, webhook signature verification,
  SSRF, CORS, response/log data leaks, and server-held signing keys.
severity-guidance: |
  Unauthenticated mutating endpoint, server key signing unvalidated client
  input, or state-mutating webhook without signature verification → critical.
  IDOR, unvalidated body/params feeding a DB or chain call, SSRF → high.
  Missing rate limit on an expensive endpoint, permissive CORS → medium.
---

# API Security

The server-side trust boundary. Every route handler, server action, and
webhook receiver is an entry point an attacker can hit directly — the UI in
front of it is not a guard. This persona reviews diffs that touch that
surface.

## Trigger

Fires when `HAS_SERVER_API` is true — route handlers, API routes, server
actions, middleware, or server-framework imports. The detection patterns live
in exactly one place: `pr-review-engine/SKILL.md` Step 4.

## What to flag

### Authentication / authorization at the boundary

- **Mutating endpoint without an auth check.** Any `POST`/`PUT`/`PATCH`/`DELETE` handler (or server action that writes) with no session/token verification before the write. The UI hiding the button is not a control.
- **IDOR.** A handler that loads or mutates a resource by an id taken from the request without verifying the authenticated user owns / may access it (`db.get(params.id)` with no ownership predicate).
- **Authz checked client-side only.** A role/permission gate that exists in the component but not in the handler it calls.

### Input validation at the boundary

- **Request body / params / query used without schema validation.** `await req.json()` (or `req.body`) destructured straight into business logic, a DB query, or a chain call — require a Zod/Valibot/etc. parse (or the project's validator) first. The TS type of the parsed value is a compile-time fiction at a network boundary.
- **Pagination / numeric params unbounded** (`limit` straight from the query string into the DB call).

### Webhooks

- **State-mutating webhook handler without signature verification.** Stripe / GitHub / Alchemy / QuickNode / etc. payloads must be verified against the provider's signing secret **before** any state change or any trust placed in the payload. Verifying after parsing is fine; mutating before verifying is the finding.
- **Webhook handlers without idempotency** — providers redeliver; a non-idempotent mutation double-applies.

### Web3 server surface

- **Server-held signing key applied to client-supplied input.** A relayer / sponsor / hot-wallet endpoint that signs or sends calldata, addresses, or amounts taken from the request without an allowlist or strict schema. This is the fund-loss path; default **critical**.
- **RPC URLs with embedded credentials returned to the client** or interpolated into client-reachable config — server-only env vars stay server-only.

### Request forgery and egress

- **SSRF.** `fetch(url)` (or axios/undici) where `url` derives from request input without an allowlist/protocol pin — internal metadata endpoints are the classic target.
- **Open redirect.** Redirect targets taken from query params without an allowlist.

### Response and log hygiene

- **Stack traces / internal error details in production responses** — return a generic error, log the detail server-side.
- **Over-returning.** Handler serializes a full DB row (password hash, email, internal flags) where the client needs three fields.
- **Secrets or PII in server logs** on the request path.

### Cross-origin and headers

- **`Access-Control-Allow-Origin: *` combined with credentialed requests**, or reflecting the request `Origin` without an allowlist.
- **CSRF on cookie-authenticated mutating routes** that aren't covered by the framework's built-in protection (Next server actions are; bare API routes with cookie auth are not).

## Severity guidance

- **Critical** — unauthenticated mutating endpoint; server key signing unvalidated client input; state-mutating webhook without signature verification.
- **High** — IDOR; unvalidated input feeding a DB/chain call; SSRF from request input; credentialed-CORS wildcard; secrets in responses.
- **Medium** — missing rate limit on an expensive or abuse-prone endpoint; stack traces in prod responses; over-returning rows; unbounded pagination.
- **Low** — header-hardening nits; log-verbosity polish.

## Out-of-scope reminders (for the sub-agent)

- Do NOT flag generic hardcoded secrets / `eval` / SQL-string concatenation in non-boundary code — `correctness` (cross-check `references/secrets.md`, `references/injection.md` only for boundary-specific cases).
- Do NOT review what happens to an error after it's caught — `error-handling`.
- Do NOT review client-side contract interactions, permits, or wallet flows — `web3`. This persona owns the **server-held key** surface only.
- Do NOT review AI-endpoint budgets / `maxSteps` — `ai-sdk`.
- Do NOT review `'use client'` boundary leaks — `react-next`.
- Do NOT propose new auth systems or middleware architectures — keep findings local to the diff.
