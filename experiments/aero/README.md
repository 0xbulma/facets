# ▲ aero

A fast, opinionated full-stack React framework. It doesn't reinvent the wheel —
it composes three best-in-class pieces into a cohesive whole:

| Layer | Tech | Why |
|---|---|---|
| **Dev + build** | [Vite](https://vite.dev) | Instant dev startup, fast HMR (middleware mode), Rollup/Rolldown prod builds |
| **HTTP server** | [Hono](https://hono.dev) | Tiny, Web-standard, ultra-fast — runs on **Bun or Node** unchanged |
| **UI / rendering** | [React 19](https://react.dev) | Streaming SSR + client hydration |

This is the "Vite for startup speed + a super-performant server" architecture,
made turnkey: file-based routing, streaming SSR, client hydration, and a CLI.

## Quick start

```bash
bun install          # or: npm install / pnpm install

bun run dev          # dev server with HMR        → http://localhost:3000
bun run build        # client + SSR bundles → dist/
bun run start        # production Hono server      → http://localhost:3000
```

`--port` or `PORT=` overrides the port.

## How it works

```
            ┌─────────────── dev ───────────────┐         ┌──────────── prod ───────────┐
 request →  │ Node http server                  │         │ Hono (Bun/Node)             │
            │  ├─ Vite middleware (assets, HMR)  │         │  ├─ serveStatic(dist/client)│
            │  └─ falls through to Hono → SSR    │         │  └─ streaming SSR (dist/…)  │
            └───────────────────────────────────┘         └─────────────────────────────┘
```

- **Dev** (`framework/dev.ts`): Vite runs in middleware mode. Its connect
  middleware owns asset/HMR/module-graph requests; anything else falls through
  to a Hono handler that streams SSR via `vite.ssrLoadModule` (so SSR gets HMR
  too).
- **Prod** (`framework/serve.ts`): pure Hono. Hashed assets are served
  statically; everything else streams SSR from the prebuilt server bundle. The
  client `<script>`/`<link>` tags are resolved from Vite's manifest.
- **One React tree** (`framework/runtime.tsx`) is rendered identically on the
  server and hydrated on the client, so the initial render always matches.

## Routing

File-based, under `app/routes/`. The default export is the page component.

| File | URL |
|---|---|
| `app/routes/index.tsx` | `/` |
| `app/routes/about.tsx` | `/about` |
| `app/routes/blog/[slug].tsx` | `/blog/:slug` (`params.slug`) |

Static segments outrank dynamic ones. `<Link>` does client-side navigation;
`useRouter()` / `useParams()` read the current route.

## Project layout

```
framework/            the framework itself
  cli.ts              aero dev | build | start
  dev.ts              Vite middleware + Hono dev server
  build.ts            two-pass client + SSR build
  serve.ts            production Hono server
  router.ts           file-based route table (import.meta.glob)
  runtime.tsx         App, Router context, <Link>, hooks
  entry-server.tsx    React streaming SSR entry
  entry-client.tsx    hydration entry
  html.ts             document-shell streaming
app/                  your application
  root.tsx            shared layout
  routes/**           pages
```

## Status & roadmap

v0 proves the architecture end-to-end (verified in a real browser, dev + prod:
streaming SSR, hydration, SPA navigation, dynamic routes, zero console errors).

Natural next steps:

- **Data loading** — per-route `loader()` running on the server, serialized to
  the client (the SSR seam already exists).
- **Code-splitting** — lazy route modules + `<link rel=modulepreload>` for the
  matched route (currently routes are eagerly bundled).
- **Head management** — per-route `<title>`/meta.
- **Bun-native dev** — swap the Node http bridge for `Bun.serve` in dev.
- **Server functions / actions** — typed RPC over Hono routes.
