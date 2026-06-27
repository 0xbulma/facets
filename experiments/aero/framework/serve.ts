import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { documentStream } from "./html.ts";

interface ManifestEntry {
  file: string;
  css?: string[];
}
interface ServerEntry {
  render: (url: string) => Promise<ReadableStream<Uint8Array>>;
}

// Production server: pure Hono. Serves the hashed client assets statically and
// streams SSR for everything else. Runs on Node or Bun unchanged.
export async function start({ port = 3000 }: { port?: number } = {}): Promise<void> {
  const cwd = process.cwd();

  const manifest = JSON.parse(
    readFileSync(`${cwd}/dist/client/.vite/manifest.json`, "utf8"),
  ) as Record<string, ManifestEntry>;
  const entry = manifest["framework/entry-client.tsx"];
  if (!entry) throw new Error("Client manifest missing entry — run `aero build` first.");

  const headTags = [
    ...(entry.css ?? []).map((f) => `<link rel="stylesheet" href="/${f}" />`),
    `<script type="module" src="/${entry.file}"></script>`,
  ].join("\n");

  const { render } = (await import(
    pathToFileURL(`${cwd}/dist/server/entry-server.js`).href
  )) as ServerEntry;

  const app = new Hono();
  app.use("/assets/*", serveStatic({ root: "./dist/client" }));
  app.use("/favicon.ico", serveStatic({ root: "./dist/client" }));

  app.get("*", async (c) => {
    const appStream = await render(c.req.path);
    return new Response(documentStream(appStream, { headTags }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });

  serve({ fetch: app.fetch, port }, () => {
    console.log(`\n  \x1b[36maero\x1b[0m production server`);
    console.log(`  → http://localhost:${port}\n`);
  });
}
