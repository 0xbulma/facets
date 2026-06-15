_Apply these engineering principles in any codebase, whatever the language. They run from high-level solution architecture down to code design, and sit above the language-specific rules below. Where a repo's own `AGENTS.md` / `CLAUDE.md` disagrees, the repo wins._

### System & solution architecture

**The public surface is a contract.** Expose the public API through explicit, named exports; keep everything else internal (unexported or marked internal). Treat changes to it under SemVer, and deprecate before removing — mark it deprecated, keep it for one minor, drop it the next major.

**Layered, one-way dependencies.** Define explicit layers (e.g. `UI → application → domain`) and let dependencies point one way only — lower layers never import upward, and the graph has no cycles. The domain depends on nothing outward and imports no framework.

**Respect package/module boundaries.** Import another package through its public entry point (`@org/pkg`), never via deep or relative cross-package paths. Each package owns its own constants and types.

**Security & trust boundaries.** Authenticate and authorize at the edge. Validate and parse every external input — request, env, file, third-party response, chain read — into trusted types before it reaches the core. Never log or commit secrets; grant least privilege.

**Supply chain & dependencies.** Keep dependencies few and justified; prefer the platform/standard library and existing code. Commit the lockfile; pin exact versions (no `^`/`~`), or the workspace protocol for internal deps. Import granularly (one function, not a whole-library barrel). Publish with provenance; pin CI actions to a SHA.

**Observability.** Report each error once, at the boundary, through a single capture/report helper — not scattered through the code. Attach structured context; don't double-report; only attach a `cause` when it is a real exception.

**Change management.** Conventional Commits; a changeset (or equivalent) for every user-facing change. Never commit to the main branch — open a (draft) PR. CI is zero-warning and runs through the task runner, not raw per-package scripts.

### Application architecture

**Functional core, imperative shell.** Keep business logic in pure functions; push all I/O — network, db, filesystem, clock, randomness, environment — to a thin outer shell that calls the core. The core never reaches for the outside world.

**Prefer stateless and immutable.**

- Default to pure functions: output depends only on inputs, no side effects; same input → same output.
- Treat data as immutable — return new values, never mutate arguments; expose `readonly` fields/collections, and freeze outputs that consumers may retain.
- No module-level mutable state and no ambient singletons. Shared state is explicit and passed in, not reached for.

**Isolate I/O.**

- Wrap every I/O behind a small, single-purpose function/adapter (`fetchOrder`, `saveUser`) with an explicit signature; domain code depends on the interface, not the concrete client.
- I/O functions stay thin: perform the call, map errors, validate/parse the result into domain types — no business logic inside.
- Treat I/O as async; handle timeouts, cancellation, and failure explicitly.

**Inject dependencies, don't reach for them.** Time, randomness, config, loggers, and clients are dependencies — pass them in. This keeps code deterministic and testable and makes coupling visible. Avoid service locators and global access.

**Errors.** Model expected outcomes as values or typed domain errors — one type per failure mode. Libraries throw exported `Error` subclasses (consumers match by class; tests assert by class identity, not message text); apps use typed error objects plus a `tryCatch`/capture helper. Throw only for bugs and invariant violations, never for normal control flow; preserve the original `cause`; never throw strings or silently swallow.

**Side effects, idempotency & concurrency.** Make retried operations idempotent. Never leave async work unawaited/unhandled; bound concurrency; never share mutable state across concurrent tasks. Keep functions referentially transparent so they're safe to cache and parallelize.

**Configuration.** Validate config/env once at startup into a typed, frozen object — no config reads scattered through the code.

### Module & code design

**Modularity & cohesion.** Small, composable modules with one responsibility and a narrow public surface; hide internals. Composition over inheritance — prefer functions + plain data; reserve classes for genuine stateful entities/resources. Prefer factory functions over singletons; model I/O as interfaces with mock implementations for tests.

**Make illegal states unrepresentable.**

- Model precisely: tagged/discriminated unions instead of boolean flags; distinct types for IDs and units rather than bare strings/numbers; types that can't represent the invalid case.
- Parse, don't validate: turn untrusted input into trusted typed values once at the boundary; the core then assumes validity.
- Handle every case of a union exhaustively.

**Interfaces & API design.** Narrow, intention-revealing signatures; accept abstractions, return concrete types; don't leak internal types across the public surface. Pass an options object beyond ~2–3 parameters; avoid boolean parameters (use a named/union option instead).

**Function shape.** Keep functions small and single-purpose; use early returns to avoid deep nesting (≤3 levels); use strict equality (`===` / `!==`).

**Comments & documentation.** Write self-documenting code; comment only what would surprise a reader. No commented-out code, and no issue-tracker notes in comments. Scale doc comments to the surface: document every export of a published library (worth enforcing in CI), but only the cross-boundary public API of application code.

**Design for testability.** Every module and function should be testable in isolation, without spinning up the world. You get this for free from the principles above — keep logic pure, inject dependencies, isolate I/O behind interfaces, avoid hidden state. If something is awkward to test, treat it as a design smell and refactor the code, not the test — don't reach for heavy mocking or global setup to compensate.

**Testing follows the architecture.** Cover the pure core heavily with fast, mock-free unit tests; cover the I/O shell with thin contract/integration tests; mock only at the I/O boundary. Test behavior and edge cases, not internals.

### Anti-patterns to avoid

- Mutable global/module state or ambient singletons.
- Business logic inside I/O adapters, request handlers, or UI components.
- Reaching for time/randomness/env/network directly inside domain code.
- Boolean-flag parameters; primitive obsession (raw strings/numbers for IDs, money, units).
- Circular dependencies; deep/relative imports across package boundaries; reaching past a module's public API into its internals.
- God-files and grab-bag "utils" modules with no cohesion.
- Swallowing errors, using exceptions for control flow, throwing strings, or leaving async work unawaited.
- Secrets in code, logs, or commits; unpinned (`^`/`~`) dependency versions.
- Code that can only be tested via heavy mocking, global setup, or a full end-to-end run — a testability smell pointing at a design problem.
- Commented-out code, or comments that restate the code or track issue numbers.
