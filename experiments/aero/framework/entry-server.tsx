import { renderToReadableStream } from "react-dom/server";
import { App } from "./runtime.tsx";

// SSR entry. Returns a web ReadableStream of the app markup (no surrounding
// <html> — the server wrapper in dev.ts / serve.ts streams the document
// shell around it). React 19's streaming renderer handles Suspense here.
export async function render(url: string): Promise<ReadableStream<Uint8Array>> {
  return renderToReadableStream(<App url={url} />, {
    onError(error) {
      console.error("[aero] SSR error:", error);
    },
  });
}
