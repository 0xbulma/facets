import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Aero uses Vite only as the build/transform engine. In dev it runs in
// middleware mode behind a Hono server (see framework/dev.ts); in prod it
// produces the client + SSR bundles (see framework/build.ts).
export default defineConfig({
  plugins: [react()],
});
