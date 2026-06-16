---
name: inject-wallet
version: 0.2.0
description: Connect a test wallet so an agent can spin up a dev server and browser, get past the Reown AppKit connect modal, and screenshot/test the authenticated dApp UI. Injects an EIP-1193 + EIP-6963 provider (no wallet extension) and proxies signing/sends to Anvil or an RPC. Use when user says /facets:inject-wallet, "screenshot my dApp", "connect a wallet to test", "test my AppKit app", or "the wallet modal blocks my browser tests". Optional Anvil fork; mock-connector fallback for SIWE-heavy apps.
---

# /facets:inject-wallet — connect a wallet, then screenshot the dApp

A wallet-less agent browser stalls at Reown AppKit's connect modal and never
reaches the authenticated UI. This skill injects a dependency-free **EIP-1193
provider** before the page loads and announces it over **EIP-6963** (AppKit's
wallet-discovery standard), so AppKit lists and connects an "E2E Wallet". Reads,
`personal_sign`, and `eth_sendTransaction` are proxied to the chain backend
(local Anvil fork or an existing RPC) — there is no in-browser cryptography.

The heavy lifting lives in `scripts/` (a typed Node CLI). This skill is the thin
wrapper: pick the routes, mode, and backend, then run the CLI and interpret the
result.

## When to use

- You need a screenshot of the **connected** state of an AppKit / wagmi dApp.
- An agent's browser run is blocked by the connect modal.
- You want runtime smoke-testing of authenticated routes without a real wallet.

## Pre-conditions

- **Node ≥ 22.18** (the CLI is TypeScript, run via Node's native type-stripping).
  Older Node: prefix the command with `npx -y tsx` instead of `node`.
- **agent-browser** on PATH for inject mode: `npm i -g agent-browser && agent-browser install`. It is the only browser tool that injects a script *before* navigation (`--init-script`); the claude-in-chrome MCP runs JS post-load, too late to seed `window.ethereum`.
- **Foundry / `anvil`** on PATH if using `--anvil` (https://getfoundry.sh).
- A discoverable dev script in the dApp's `package.json` (`dev` / `start` / `serve*`), or pass `--dev-cmd`.

## Step 1 — Confirm the stack and choose options

Run from the **dApp project root** (the CLI detects `package.json` and writes
screenshots under `<cwd>/.context/inject-wallet` — add `.context/` to the dApp's
`.gitignore` so the PNGs don't litter `git status`, or pass `--out <dir>`).

- Confirm it is an AppKit/wagmi dApp: look for `@reown/appkit`, `createAppKit`, `useAppKit`, or `wagmi` in `package.json` / source.
- Pick **routes** to capture (the connected pages worth a screenshot).
- Pick a **backend**: `--anvil` (optionally `--fork-url <rpc>` for realistic balances/txs; Anvil signs `personal_sign`/sends for its unlocked account) or `--rpc <url>` (read-only; good for pure connected-UI screenshots).
- Optionally **view-as another address** with `--impersonate <0x..>`: connect *as* an arbitrary address (a whale, a specific protocol user, a multisig) and proxy reads to the backend, so the connected UI renders that address's real balances/positions. It is **read-only** — the provider holds no key, so sends and signatures are rejected up front. Pair it with `--rpc <publicRpc>` to view real mainnet state without forking. Not for SIWE / tx flows (see Notes).
- Pick a **mode**: `inject` (default) or `mock` (the app already wires an env-gated wagmi `mock` connector — see Step 5).

## Step 2 — Run the orchestrator

```bash
# Anvil fork backed, two routes, browser injection (default mode):
node "${CLAUDE_PLUGIN_ROOT}/skills/inject-wallet/scripts/inject-wallet.ts" \
  --anvil --fork-url "$RPC_URL" --url / --url /dashboard

# Read-only against a public RPC:
node "${CLAUDE_PLUGIN_ROOT}/skills/inject-wallet/scripts/inject-wallet.ts" \
  --rpc "$RPC_URL" --routes "/app,/portfolio"

# View any address's connected UI, read-only, against a public RPC:
node "${CLAUDE_PLUGIN_ROOT}/skills/inject-wallet/scripts/inject-wallet.ts" \
  --rpc "$RPC_URL" --impersonate 0xWhale… --url /portfolio

# Inspect the plan without booting anything:
node "${CLAUDE_PLUGIN_ROOT}/skills/inject-wallet/scripts/inject-wallet.ts" \
  --anvil --url / --dry-run
```

The CLI boots the backend + dev server, injects the wallet, navigates each
route, attempts an auto-connect, screenshots (`--full`), then tears everything
down. Run `--help` for all flags. If `agent-browser`'s command surface differs
on your version, confirm it with `agent-browser skills get core --full` and
adjust the verbs in `scripts/lib/browser.ts`.

## Step 3 — If auto-connect returns `connected=false`, drive the click yourself

The in-page connect helper (`connect-appkit.ts`) is best-effort: AppKit's modal
is Shadow-DOM web components and its markup drifts. When a route reports
`connected=false` but `navigated=true`, the wallet is injected and AppKit can
see it — only the click missed. Take over with agent-browser's accessibility
snapshot, which is far more robust than DOM selectors:

```bash
agent-browser skills get core --full     # confirm current syntax first
agent-browser snapshot -i                # find the "Connect Wallet" @eN ref
agent-browser click @eN                  # open the modal
agent-browser snapshot -i                # find the "E2E Wallet" entry @eM
agent-browser click @eM                  # connect
agent-browser screenshot connected.png --full
```

If AppKit still won't connect (custom connector, hardened SIWE, CSP blocking the
injected `fetch`), switch to the mock-connector path (Step 5).

## Step 4 — Report

Parse the CLI's `RESULT_JSON=` line and summarize for the user:

- Per route: `connected`, the screenshot path, and any `consoleErrors` (the CLI
  currently only records connect failures here — it does not yet scrape browser
  console output or HTTP status, so inspect the screenshots for render errors).
- Call out routes that stayed disconnected or errored.
- Attach/point to the screenshots for the human.

Use this sentinel shape per finding so it matches the other facets reviewers:

```
WHAT: <what happened + the route URL>. FIX: <one-line hint>.
```

## Step 5 — Fallback: env-gated wagmi mock connector (CI-deterministic)

For SIWE-heavy or custom-connector apps, the deterministic path is an app-side
`mock` connector gated behind an E2E env flag (the dev server is already booted
with `NEXT_PUBLIC_E2E_WALLET=1` / `VITE_E2E_WALLET=1`). It auto-connects with no
modal — no provider injection needed (so it also works under a plain browser
tool / the claude-in-chrome MCP, not just `agent-browser`). This CLI's
`--mode mock` still drives `agent-browser` for the navigate + screenshot step, so
`agent-browser` is required either way; the difference is only that mock mode
skips injection. Wire it per `references/mock-connector.md`, then re-run with
`--mode mock`.

## Notes

- **Security.** The default signer is Anvil's well-known dev account (publicly
  known, zero value). Never pass a real private key. The mock connector is
  env-gated so it cannot reach production. The injected provider exists only in
  the agent's ephemeral browser session.
- **`--impersonate` is read-only.** It reports an address you don't hold the key
  for, so reads return that address's real on-chain state but **sends and
  signatures are rejected** (the provider throws an EIP-1193 `4100` with a clear
  message). SIWE login, Permit2, and any typed-data/`personal_sign` step cannot
  complete — that's inherent, not a bug. For those, connect as a key-holding
  Anvil account (drop `--impersonate`) or use the mock connector (`--mode mock`,
  Step 5). The connect helper flips `e2eConnected` on `eth_requestAccounts`
  *before* any signature, so the connected screenshot still lands even when a
  later SIWE step is rejected.
- **How discovery works.** AppKit finds the wallet via legacy `window.ethereum`
  *and* an `eip6963:announceProvider` event (rdns `io.facets.e2ewallet`,
  name "E2E Wallet").
- **TypeScript, no runtime deps.** The whole CLI is TypeScript; it runs on
  Node's native type-stripping (Node >= 22.18) with zero installed dependencies.
  The browser payloads (`provider.ts`, `connect-appkit.ts`) are stripped to
  classic JS just before injection. Lint/typecheck/test the scripts from the
  marketplace repo root with `pnpm install` then `pnpm verify`
  (Biome + `tsc` + Vitest); the dev toolchain is dev-only and never ships in the
  injected output.
- **Troubleshooting** (selector drift, SIWE, CSP, chain mismatch, Synpress):
  `references/troubleshooting.md`.
