# Troubleshooting

Symptoms, causes, and fixes for the inject path. When a fix says "use mock", see
`mock-connector.md`.

## `connected=false` but `navigated=true`

The wallet injected fine; only the modal click missed (AppKit Shadow-DOM markup
drift). Take over with agent-browser's accessibility snapshot — see SKILL.md
Step 3 (`snapshot -i` → click the "Connect Wallet" ref → `snapshot -i` → click
the "E2E Wallet" ref). If it still won't connect, use mock.

## "E2E Wallet" never appears in the modal

AppKit discovers wallets via EIP-6963. If the announce was missed:

- Ensure the init-scripts registered **before** navigation — the CLI does
  `agent-browser open --init-script …` then `navigate`. Confirm both
  `--init-script` flags are present in the logged command.
- Make sure no real wallet extension is loaded in the agent browser; it can win
  the `window.ethereum` slot. Use a clean agent-browser profile.
- Confirm `agent-browser`'s `--init-script` syntax for your version:
  `agent-browser skills get core --full`.

## SIWE / sign-in signature is rejected

The dApp calls `personal_sign`, which the provider proxies to the backend.

- **Read-only `--rpc` mode cannot sign** — a public RPC holds no key. Use
  `--anvil` (the unlocked account signs) or the mock connector with an Anvil
  transport.
- **Older Anvil lacks `personal_sign`** — the provider falls back to `eth_sign`
  with swapped params. If the recovered signer still mismatches, upgrade Foundry
  (`foundryup`) so native `personal_sign` is used, or switch to mock.
- **EIP-712 typed data**: `eth_signTypedData_v4` is proxied verbatim; ensure your
  Anvil build supports it, else use mock.

## `--impersonate`: sends/signs rejected with "read-only impersonation"

Expected. `--impersonate <0x..>` is a view-as mode — the provider reports an
address it holds **no key** for, so it rejects `eth_sendTransaction`,
`personal_sign`, `eth_sign`, and `eth_signTypedData*` up front (EIP-1193 `4100`)
instead of failing cryptically against the backend. Reads still return that
address's real on-chain state.

- **Just want the connected screenshot?** The connect helper flips
  `e2eConnected` on `eth_requestAccounts` *before* any signature, so the
  screenshot lands even if the dApp then attempts SIWE and gets rejected.
- **Need a working sign/tx?** Drop `--impersonate` and connect as a key-holding
  Anvil account (`--anvil`, optionally `--fork-url`), or use the mock connector
  (`--mode mock`) — see `mock-connector.md`.
- **Nothing impersonated?** `--impersonate` is ignored in `--mode mock` (the
  app-side connector chooses the account); the CLI logs a warning when both are
  passed.

## Reads fail / CSP blocks the RPC

The injected provider `fetch`es the RPC from the page origin. A strict
`Content-Security-Policy` `connect-src` can block a cross-origin RPC.

- In dev, add the RPC origin (e.g. `http://127.0.0.1:8545`) to `connect-src`.
- Or proxy the RPC under the app origin (Next.js rewrite / Vite proxy) and pass
  that proxied URL as `--rpc`.

## "Wrong network" / chain mismatch

The app expects a specific chain id. Pass `--chain-id <n>` to match it (with
`--anvil`, also start Anvil on that id). AppKit's network switch calls
`wallet_switchEthereumChain`, which the provider honors and emits `chainChanged`.

## `ERR_INVALID_TYPESCRIPT_SYNTAX` / `stripTypeScriptTypes is not a function`

Node is too old for native TypeScript. Requires **Node ≥ 22.18**. Either upgrade
Node, or run the CLI through `tsx`:

```bash
npx -y tsx "${CLAUDE_PLUGIN_ROOT}/skills/inject-wallet/scripts/inject-wallet.ts" --anvil --url /
```

## agent-browser preflight failed (missing / broken / browser not installed)

The CLI probes `agent-browser --version` + `agent-browser doctor` before booting
anything, and prints a mode-specific fix:

- **not found on PATH** — `npm i -g agent-browser && agent-browser install`.
- **on PATH but the browser is not ready** — you ran `npm i -g agent-browser` but
  skipped the second step: `agent-browser install` downloads Chrome. Repair a
  stale install with `agent-browser doctor --fix`.
- **on PATH but won't run** (broken / incompatible) — reinstall, then verify with
  `agent-browser doctor`.

If a *subcommand* errors mid-run instead, the CLI surface changed — confirm with
`agent-browser skills get core --full` and adjust the verbs in
`scripts/lib/browser.ts`.

## What about Synpress (real MetaMask)?

Synpress drives a real MetaMask extension in Playwright/Cypress — the most
"realistic" option, but heavy and it needs the extension loaded into the browser
context, which is not how agent-browser / the MCP run here. Prefer the inject or
mock paths for agent-driven screenshots; reach for Synpress only in a dedicated
Playwright e2e suite.
