import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { healthRoutes } from './routes/health.js';
import { workflowRoutes } from './routes/workflows.js';
import { credentialRoutes } from './routes/credentials.js';
import { executionRoutes } from './routes/executions.js';
import { authMiddleware } from './middleware/auth.js';

export async function buildApp(
  opts: { logger?: boolean | object } = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  });

  // --- Plugins ---

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Handled by frontend
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // --- Public routes (no auth) ---

  await app.register(healthRoutes);

  // --- Auth hook for /api/* routes ---

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      await authMiddleware(request, reply);
    }
  });

  // --- Authenticated API routes ---

  await app.register(workflowRoutes);
  await app.register(credentialRoutes);
  await app.register(executionRoutes);

  return app;
}

export async function start(): Promise<FastifyInstance> {
  const port = Number(process.env.PORT ?? 3100);
  const host = process.env.HOST ?? '0.0.0.0';

  const app = await buildApp();

  try {
    await app.listen({ port, host });
    app.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  return app;
}

// Start server if this is the main module
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/server.js') ||
  process.argv[1]?.endsWith('/server.ts');

if (isMain) {
  start();
}
