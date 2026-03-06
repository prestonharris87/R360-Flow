import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.integration.test.ts', 'src/__tests__/connection.test.ts'],
    testTimeout: 30000,
  },
});
