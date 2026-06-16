import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['plugins/facets/skills/**/scripts/**/*.test.ts'],
  },
});
