import { buildApp } from '../../server.js';
import type { FastifyInstance } from 'fastify';

/**
 * Creates a Fastify test server instance with all plugins and routes registered.
 * Logger is disabled for cleaner test output.
 * Use `app.inject()` for making test requests without starting a real HTTP server.
 */
export async function createTestServer(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false });
  await app.ready();
  return app;
}
