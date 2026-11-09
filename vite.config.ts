import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves the site under /<repo-name>/
  base: '/bairros-rj/',
  build: {
    // MapLibre alone is ~1 MB minified (~280 KB gzipped); nothing to gain from the warning.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Keep MapLibre in its own long-cached chunk so game updates don't re-download it.
        codeSplitting: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ }],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
