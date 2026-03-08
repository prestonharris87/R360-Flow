import type { FastifyInstance } from 'fastify';
import type { HealthService } from '../services/health-service';

export interface HealthRoutesConfig {
  healthService: HealthService;
}

export async function healthRoutes(fastify: FastifyInstance, opts: HealthRoutesConfig): Promise<void> {
  fastify.get('/api/health', async (_request, reply) => {
    const result = await opts.healthService.check();
    const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
    return reply.status(statusCode).send(result);
  });

  fastify.get('/api/health/ready', async (_request, reply) => {
    const result = await opts.healthService.check();
    return reply.status(result.status === 'unhealthy' ? 503 : 200).send({ ready: result.status !== 'unhealthy' });
  });

  fastify.get('/api/health/live', async (_request, reply) => {
    return reply.send({ alive: true, uptime: Date.now() });
  });

  fastify.get('/api/metrics', async (_request, reply) => {
    return reply.send(opts.healthService.getMetrics());
  });
}
