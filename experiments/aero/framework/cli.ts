#!/usr/bin/env node
// Aero CLI — `aero dev | build | start`. Run under Node's native type
// stripping (node --experimental-strip-types) or Bun directly.
export {}; // mark as a module so top-level await is allowed

function parsePort(): number | undefined {
  const i = process.argv.indexOf("--port");
  if (i !== -1 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  if (process.env.PORT) return Number(process.env.PORT);
  return undefined;
}

const cmd = process.argv[2];
const port = parsePort();

switch (cmd) {
  case "dev": {
    const { dev } = await import("./dev.ts");
    await dev({ port });
    break;
  }
  case "build": {
    const { build } = await import("./build.ts");
    await build();
    break;
  }
  case "start": {
    const { start } = await import("./serve.ts");
    await start({ port });
    break;
  }
  default:
    console.log(`aero — a fast full-stack React framework

Usage:
  aero dev [--port 3000]     start the Vite + Hono dev server (HMR)
  aero build                 build client + SSR bundles into dist/
  aero start [--port 3000]   run the production Hono server
`);
    process.exit(cmd ? 1 : 0);
}
