import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/__tests__/integration/**', 'src/__tests__/e2e-*'],
    testTimeout: 30000,
  },
});
