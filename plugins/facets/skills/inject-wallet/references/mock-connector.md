# Fallback: env-gated wagmi `mock` connector

The browser-injection path exercises the real connect flow but depends on
clicking AppKit's Shadow-DOM modal and on the backend being able to sign. When
that is fragile — SIWE-heavy apps, custom connectors, hardened CSP — wire an
app-side **`mock` connector** gated behind an E2E env flag. It auto-connects with
no modal, is deterministic, and works with any browser tool (including the
claude-in-chrome MCP). It is the recommended CI path.

The dev server is already started with `NEXT_PUBLIC_E2E_WALLET=1`,
`VITE_E2E_WALLET=1`, and `PUBLIC_E2E_WALLET=1` set, so gate on whichever your
bundler exposes.

## wagmi v2 + Reown AppKit

```ts
// wagmi-config.ts
import { http, createConfig } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { mock } from '@wagmi/connectors';

const E2E = process.env.NEXT_PUBLIC_E2E_WALLET === '1'; // or import.meta.env.VITE_E2E_WALLET

// Anvil/Hardhat dev account #0 — universally known, holds nothing on mainnet.
const E2E_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

// Point the transport at the SAME backend the screenshot run uses. With Anvil
// (account unlocked), signMessage/sendTransaction route through the mock
// connector to Anvil, which signs for real — matching the injection path.
const E2E_RPC = process.env.NEXT_PUBLIC_E2E_RPC ?? 'http://127.0.0.1:8545';

export const wagmiConfig = createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: http(E2E ? E2E_RPC : undefined) },
  connectors: E2E
    ? [mock({ accounts: [E2E_ADDRESS], features: { reconnect: true } })]
    : [/* your production connectors */],
});
```

Pass that config to AppKit's wagmi adapter (the exact option name varies by
AppKit version — check `@reown/appkit-adapter-wagmi`):

```ts
import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';

const wagmiAdapter = new WagmiAdapter({
  networks: [mainnet],
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID!,
  connectors: wagmiConfig.connectors, // include the mock connector when E2E
});

createAppKit({ adapters: [wagmiAdapter], networks: [mainnet], projectId: '…' });
```

Trigger the auto-connect on mount when E2E (so no click is needed):

```ts
import { useEffect } from 'react';
import { useConnect } from 'wagmi';

export function E2EAutoConnect() {
  const { connect, connectors } = useConnect();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_WALLET !== '1') return;
    const mockConnector = connectors.find((c) => c.id === 'mock');
    if (mockConnector) connect({ connector: mockConnector });
  }, [connect, connectors]);
  return null;
}
```

Then run the screenshot CLI with `--mode mock` (and the same `--anvil`/`--rpc`
backend so the transport matches).

## Notes

- **Real signatures** require the transport to reach a node that holds the key —
  i.e. Anvil with the account unlocked. Against a public read-only RPC the mock
  connector connects and renders but cannot produce a valid SIWE signature.
- **Never** hardcode a real private key. For a key (only needed if you sign
  locally rather than via Anvil), copy "Private Key (0)" from `anvil`'s startup
  banner or generate a throwaway with `viem`'s `generatePrivateKey()`.
- Keep the whole block behind the env flag so it is tree-shaken/guarded out of
  production builds.
