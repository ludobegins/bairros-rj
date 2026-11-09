import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves the site under /<repo-name>/
  base: '/bairros-rj/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
