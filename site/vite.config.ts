import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Conductor assigns each workspace a port range; honor it so parallel
// workspaces don't collide. Falls back to Vite's defaults when unset.
const port = process.env.CONDUCTOR_PORT ? Number(process.env.CONDUCTOR_PORT) : undefined;

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/facets/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port },
  preview: { port },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
