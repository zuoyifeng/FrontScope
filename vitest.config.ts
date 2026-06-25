import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
  },
  css: {
    postcss: {},
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'scanner/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'work/**', 'outputs/**'],
  },
});
