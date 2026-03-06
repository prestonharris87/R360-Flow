import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for E2E / integration tests.
 *
 * These tests exercise the full execution pipeline including n8n package
 * loading and workflow execution. They are heavier than unit tests and
 * are run separately via `pnpm test:e2e` or `pnpm test:integration`.
 *
 * The main vitest.config.ts explicitly excludes e2e-* files, so these
 * tests only run when this config is explicitly selected.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/e2e-*.test.ts'],
    testTimeout: 60000,
    // Give the overall suite more time since n8n-nodes-base loading is slow
    hookTimeout: 120000,
  },
});
