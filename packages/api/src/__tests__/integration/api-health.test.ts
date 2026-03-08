import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer } from '../helpers/test-server';
import type { FastifyInstance } from 'fastify';

/**
 * API Health & Authentication Integration Tests
 *
 * Verifies:
 * - Health check endpoint reports database status
 * - All /api/* routes require authentication
 *
 * Requirements:
 * - Real PostgreSQL database (configured via DATABASE_URL)
 */

describe('API Health (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestServer();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ---- Health Check ----

  it('GET /health returns 200 with database and redis status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');

    // Database should be connected in integration test environment
    expect(body.database).toBe('connected');

    // Redis is stubbed as not_configured in Phase 1
    expect(body.redis).toBe('not_configured');
  });

  // ---- Authentication Required ----

  it('GET /api/workflows without auth returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBeDefined();
  });

  it('GET /api/credentials without auth returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/credentials',
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBeDefined();
  });

  it('GET /api/executions without auth returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/executions',
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toBeDefined();
  });
});
