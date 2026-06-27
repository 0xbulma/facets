import react from "@vitejs/plugin-react";
import { build as viteBuild } from "vite";

// Two-pass production build:
//   1. client bundle (hydration + assets) with a manifest
//   2. SSR bundle (the render() entry) for the Hono prod server
export async function build(): Promise<void> {
  console.log("\n  aero: building client bundle…");
  await viteBuild({
    plugins: [react()],
    build: {
      outDir: "dist/client",
      manifest: true,
      rollupOptions: {
        input: "framework/entry-client.tsx",
      },
    },
  });

  console.log("\n  aero: building SSR bundle…");
  await viteBuild({
    plugins: [react()],
    build: {
      ssr: "framework/entry-server.tsx",
      outDir: "dist/server",
      rollupOptions: {
        output: { entryFileNames: "entry-server.js" },
      },
    },
  });

  console.log("\n  aero: build complete → dist/\n");
}
