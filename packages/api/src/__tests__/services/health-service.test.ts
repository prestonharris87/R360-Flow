import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthService } from '../../services/health-service.js';
import type { HealthChecker, ComponentHealth } from '../../services/health-service.js';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  it('should report healthy with no checkers', async () => {
    const result = await service.check();
    expect(result.status).toBe('healthy');
    expect(result.components).toHaveLength(1);
    expect(result.components[0]!.name).toBe('api');
    expect(result.components[0]!.status).toBe('healthy');
  });

  it('should report healthy when all components healthy', async () => {
    const dbChecker: HealthChecker = {
      name: 'database',
      check: async (): Promise<ComponentHealth> => ({
        name: 'database',
        status: 'healthy',
        latencyMs: 5,
      }),
    };
    const redisChecker: HealthChecker = {
      name: 'redis',
      check: async (): Promise<ComponentHealth> => ({
        name: 'redis',
        status: 'healthy',
        latencyMs: 2,
      }),
    };

    service.addChecker(dbChecker);
    service.addChecker(redisChecker);

    const result = await service.check();
    expect(result.status).toBe('healthy');
    expect(result.components).toHaveLength(2);
    expect(result.components[0]!.name).toBe('database');
    expect(result.components[0]!.status).toBe('healthy');
    expect(result.components[1]!.name).toBe('redis');
    expect(result.components[1]!.status).toBe('healthy');
  });

  it('should report degraded when a component is degraded', async () => {
    const healthyChecker: HealthChecker = {
      name: 'database',
      check: async (): Promise<ComponentHealth> => ({
        name: 'database',
        status: 'healthy',
        latencyMs: 3,
      }),
    };
    const degradedChecker: HealthChecker = {
      name: 'redis',
      check: async (): Promise<ComponentHealth> => ({
        name: 'redis',
        status: 'degraded',
        details: 'High latency detected',
        latencyMs: 500,
      }),
    };

    service.addChecker(healthyChecker);
    service.addChecker(degradedChecker);

    const result = await service.check();
    expect(result.status).toBe('degraded');
    expect(result.components).toHaveLength(2);
  });

  it('should report unhealthy when a component is unhealthy', async () => {
    const healthyChecker: HealthChecker = {
      name: 'database',
      check: async (): Promise<ComponentHealth> => ({
        name: 'database',
        status: 'healthy',
      }),
    };
    const degradedChecker: HealthChecker = {
      name: 'redis',
      check: async (): Promise<ComponentHealth> => ({
        name: 'redis',
        status: 'degraded',
      }),
    };
    const unhealthyChecker: HealthChecker = {
      name: 'queue',
      check: async (): Promise<ComponentHealth> => ({
        name: 'queue',
        status: 'unhealthy',
        details: 'Connection refused',
      }),
    };

    service.addChecker(healthyChecker);
    service.addChecker(degradedChecker);
    service.addChecker(unhealthyChecker);

    const result = await service.check();
    expect(result.status).toBe('unhealthy');
    expect(result.components).toHaveLength(3);
  });

  it('should handle checker exceptions', async () => {
    const failingChecker: HealthChecker = {
      name: 'external-api',
      check: vi.fn().mockRejectedValue(new Error('Connection timeout')),
    };

    service.addChecker(failingChecker);

    const result = await service.check();
    expect(result.status).toBe('unhealthy');
    expect(result.components).toHaveLength(1);
    expect(result.components[0]!.name).toBe('external-api');
    expect(result.components[0]!.status).toBe('unhealthy');
    expect(result.components[0]!.details).toContain('Connection timeout');
  });

  it('should track request metrics', () => {
    service.recordRequest(50, false);
    service.recordRequest(100, false);
    service.recordRequest(200, true);

    const metrics = service.getMetrics();
    expect(metrics.requestCount).toBe(3);
    expect(metrics.errorCount).toBe(1);
  });

  it('should calculate average response time', () => {
    service.recordRequest(100, false);
    service.recordRequest(200, false);
    service.recordRequest(300, false);

    const metrics = service.getMetrics();
    expect(metrics.avgResponseTimeMs).toBe(200);
  });

  it('should track uptime', () => {
    const metrics = service.getMetrics();
    expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    expect(metrics.uptime).toBeLessThan(5000); // Should be very small in a test
  });
});
