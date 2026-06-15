### Web3 / EVM

- **All on-chain integers and token amounts are `bigint`** — never `number` or floating point. Keep raw base units (wei) in the domain; format to decimals only at the UI edge.
- Prefer **viem** for low-level chain interaction; use **wagmi** hooks in React. Keep one consistent client library — don't mix ethers and viem in the same package without reason.
- **Simulate before you write** (`simulateContract` / equivalent) and surface revert reasons; never assume a transaction succeeds.
- Treat every chain read as untrusted external input — validate/parse it at the boundary like any other IO.
- Pin chain IDs and contract addresses in typed constants, not inline magic strings; isolate them per network.
