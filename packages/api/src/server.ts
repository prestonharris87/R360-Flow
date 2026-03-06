import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { healthRoutes } from './routes/health.js';
import { workflowRoutes } from './routes/workflows.js';
import { credentialRoutes } from './routes/credentials.js';
import { executionRoutes } from './routes/executions.js';
import { nodeRoutes } from './routes/nodes.js';
import { authMiddleware } from './middleware/auth.js';
import { ensureBootstrapped } from './services/execution-bridge.js';

// Phase 4: Webhook components
import { WebhookRegistry } from './webhooks/webhook-registry.js';
import { WebhookRouter } from './webhooks/webhook-router.js';
import type { ExecutionQueueInterface } from './webhooks/webhook-router.js';
import { webhookRoutes } from './routes/webhook-routes.js';

// Phase 4: Scheduler
import { SchedulerService } from './scheduler/scheduler-service.js';
import type { SchedulerDb, SchedulerExecutionQueue } from './scheduler/scheduler-service.js';

// Phase 4: Real-time WebSocket
import { ExecutionMonitor } from './realtime/execution-monitor.js';
import { createExecutionWSServer } from './realtime/ws-server.js';
import type { WSAuthenticator } from './realtime/ws-server.js';

// --- Phase 4 singletons (module-level so start/stop can access them) ---
let schedulerService: SchedulerService | null = null;
const executionMonitor = new ExecutionMonitor();

// Stub execution queue for webhook router (replaced with real BullMQ queue at integration time)
const stubExecutionQueue: ExecutionQueueInterface & SchedulerExecutionQueue = {
  async enqueue(data) {
    console.log('[StubQueue] Would enqueue execution:', data.executionId, 'for tenant:', data.tenantId);
    return { id: data.executionId };
  },
};

// Stub scheduler DB adapter (replaced with real DB adapter at integration time)
const stubSchedulerDb: SchedulerDb = {
  async getActiveScheduledWorkflows() { return []; },
  async updateLastRunAt(_workflowId: string, _runAt: Date) { /* no-op */ },
};

// Stub WebSocket authenticator (replaced with real auth at integration time)
const stubWSAuth: WSAuthenticator = {
  async authenticateToken(token: string) {
    // In production, validate JWT and extract tenant/user info
    // For now, reject all connections unless a real authenticator is wired in
    if (!token) return null;
    return null;
  },
};

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

  // --- Bootstrap n8n DI container (once, before routes) ---
  // This initializes InstanceSettings, BinaryDataService, etc.
  // Idempotent: safe to call multiple times (no-op after first).
  await ensureBootstrapped();

  // --- Public routes (no auth) ---

  await app.register(healthRoutes);

  // --- Phase 4: Webhook routes (public — external callers use signature verification, not JWT) ---

  const webhookRegistry = new WebhookRegistry();
  const webhookRouter = new WebhookRouter(webhookRegistry, stubExecutionQueue);
  await app.register(webhookRoutes(webhookRouter));

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
  await app.register(nodeRoutes);

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

  // --- Phase 4: Start scheduler service ---
  schedulerService = new SchedulerService(stubSchedulerDb, stubExecutionQueue);
  schedulerService.start();
  app.log.info('Scheduler service started');

  // --- Phase 4: Attach WebSocket server for real-time execution events ---
  // Fastify's underlying Node.js HTTP server is available after listen()
  const httpServer = app.server;
  createExecutionWSServer(httpServer, executionMonitor, stubWSAuth);
  app.log.info('WebSocket server attached for execution monitoring');

  // --- Graceful shutdown ---
  const shutdownHandler = async () => {
    app.log.info('Shutting down...');
    if (schedulerService) {
      schedulerService.stop();
      app.log.info('Scheduler service stopped');
    }
    await app.close();
  };

  process.on('SIGTERM', () => { void shutdownHandler(); });
  process.on('SIGINT', () => { void shutdownHandler(); });

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
