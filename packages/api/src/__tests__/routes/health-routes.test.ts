import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from '../../routes/health-routes';
import { HealthService } from '../../services/health-service';
import type { HealthChecker, ComponentHealth } from '../../services/health-service';

describe('Health Routes', () => {
  let app: FastifyInstance;
  let healthService: HealthService;

  beforeAll(async () => {
    healthService = new HealthService();
    app = Fastify({ logger: false });
    await app.register(healthRoutes, { healthService });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('healthy');
    expect(body.components).toBeInstanceOf(Array);
    expect(body.components.length).toBeGreaterThan(0);
  });

  it('should return readiness status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ready).toBe(true);
  });

  it('should return liveness', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health/live',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.alive).toBe(true);
    expect(body.uptime).toBeDefined();
    expect(typeof body.uptime).toBe('number');
  });

  it('should return metrics', async () => {
    // Record some requests to have non-zero metrics
    healthService.recordRequest(50, false);
    healthService.recordRequest(150, true);

    const response = await app.inject({
      method: 'GET',
      url: '/api/metrics',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.requestCount).toBe(2);
    expect(body.errorCount).toBe(1);
    expect(body.avgResponseTimeMs).toBe(100);
  });
});

describe('Health Routes - unhealthy state', () => {
  let app: FastifyInstance;
  let healthService: HealthService;

  beforeAll(async () => {
    healthService = new HealthService();

    const unhealthyChecker: HealthChecker = {
      name: 'database',
      check: async (): Promise<ComponentHealth> => ({
        name: 'database',
        status: 'unhealthy',
        details: 'Connection refused',
      }),
    };
    healthService.addChecker(unhealthyChecker);

    app = Fastify({ logger: false });
    await app.register(healthRoutes, { healthService });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 503 when unhealthy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.status).toBe('unhealthy');
  });

  it('should return 503 for readiness when unhealthy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health/ready',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.ready).toBe(false);
  });
});
