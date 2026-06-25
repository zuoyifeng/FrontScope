import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: {
    postcss: {},
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['scanner/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'work/**', 'outputs/**'],
  },
});
