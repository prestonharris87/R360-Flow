import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['src/__tests__/integration/**'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 10_000,
  },
});
