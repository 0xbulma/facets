// Streams a full HTML document around the React SSR stream. We write the
// <head> + opening #root, pipe the app stream through, then close the tags —
// true streaming SSR with a static shell.
export interface ShellOptions {
  title?: string;
  // Raw <script>/<link> tags injected into <head> (Vite client + entry in dev,
  // hashed assets in prod).
  headTags: string;
}

export function documentStream(
  appStream: ReadableStream<Uint8Array>,
  { title = "Aero", headTags }: ShellOptions,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
${headTags}
</head>
<body><div id="root">`;
  const tail = `</div></body></html>`;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(head));
      const reader = appStream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.enqueue(enc.encode(tail));
      controller.close();
    },
  });
}
