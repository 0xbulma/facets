import { createServer as createHttpServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { documentStream } from "./html.ts";

// Dev head: react-refresh preamble + Vite HMR client + the TS client entry,
// all served by Vite's middleware. These are dev-only and never shipped.
const DEV_HEAD = `<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>
<script type="module" src="/@vite/client"></script>
<script type="module" src="/framework/entry-client.tsx"></script>`;

interface ServerEntry {
  render: (url: string) => Promise<ReadableStream<Uint8Array>>;
}

export async function dev({ port = 3000 }: { port?: number } = {}): Promise<void> {
  const vite: ViteDevServer = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  const app = new Hono();

  app.all("*", async (c) => {
    try {
      // ssrLoadModule re-evaluates on change, so HMR flows through to SSR too.
      const { render } = (await vite.ssrLoadModule(
        "/framework/entry-server.tsx",
      )) as ServerEntry;
      const appStream = await render(c.req.path);
      return new Response(documentStream(appStream, { headTags: DEV_HEAD }), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      const e = err as Error;
      vite.ssrFixStacktrace(e);
      console.error(e);
      return c.text(`Aero dev error:\n${e.stack ?? e.message}`, 500);
    }
  });

  // Node http server: Vite's connect middleware owns asset/HMR/module requests
  // and falls through to Hono (the app server) for everything else.
  const honoListener = getRequestListener(app.fetch);
  const server = createHttpServer((req, res) => {
    vite.middlewares(req, res, () => honoListener(req, res));
  });

  server.listen(port, () => {
    console.log(`\n  \x1b[36maero\x1b[0m dev server ready`);
    console.log(`  → http://localhost:${port}\n`);
  });
}
