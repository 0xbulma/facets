# Test a wallet-gated dApp

Use only dummy/local accounts; never request, print, store, or inject a real private key. Treat RPC URLs as secrets: redact them from output, and note the CLI injects the backend URL into the page as `window.e2eWalletConfig.rpcUrl`, readable by any script on the dApp origin — pass only a keyless/public endpoint or a same-origin proxy to `--rpc`, never a URL whose path or query carries an API key. `--rpc` and `--impersonate` are both read-only and cannot sign/send; that guard prevents accidents and is not an isolation boundary.

Preflight: Reown AppKit/wagmi project, installed `agent-browser` skill/CLI/browser, existing dev command, and either Anvil/Foundry or an explicit RPC. Use Node >=22.18; on older Node, use `npx -y tsx` instead of `node`. Read the `agent-browser` skill fully before use. Screenshots default to `<cwd>/.context/inject-wallet`; if `.context/` is not ignored, warn or use an authorized `--out` directory.

Resolve CLI from Facets `SKILL.md`: `../../plugins/facets/skills/inject-wallet/scripts/inject-wallet.ts`. Choose:

- `--anvil [--fork-url <rpc>]`: disposable unlocked dev account; supports reads/signing/sends against Anvil.
- `--rpc <url> [--impersonate 0x…]`: real-state, read-only view; signing/sends rejected.
- `--mode mock`: env-gated wagmi mock connector for deterministic CI/SIWE-heavy apps; still uses browser automation. If the app is not wired, read `../../plugins/facets/skills/inject-wallet/references/mock-connector.md` and obtain authorization before editing app source.

Pass one or more safe routes and optional dev command; use `--dry-run` first when command/ports are uncertain. Run via Node native TypeScript, let the CLI start/stop backend and dev server, and parse its `RESULT_JSON`. If auto-connect is false, inspect the browser snapshot and click the injected wallet option once; then screenshot the connected UI. Never trigger payments, approvals, deletes, or irreversible writes.

Report mode, chain/address (never key), routes, connection state, screenshots, CLI-reported connect errors, and any manual fallback. `RESULT_JSON` does not collect browser-console output or HTTP status: inspect those separately with `agent-browser` when available and state whether they were collected; never infer they were clean. Ensure temporary config and exact spawned processes are removed; if teardown fails, report them explicitly. For selector/CSP/chain drift, read `../../plugins/facets/skills/inject-wallet/references/troubleshooting.md`.
