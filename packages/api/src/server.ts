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

// Phase 5: Security middleware
import { securityMiddleware } from './middleware/security.js';

// Phase 5: Billing
import { billingRoutes } from './routes/billing-routes.js';
import { StripeWebhookHandler } from './billing/stripe-webhook-handler.js';
import type { TenantServiceInterface } from './billing/stripe-webhook-handler.js';
import { UsageTracker } from './billing/usage-tracker.js';
import type { UsageStore, UsageRecord } from './billing/usage-tracker.js';
import { PlanLimitsEnforcer } from './billing/plan-limits.js';

// Phase 5: Admin
import { adminRoutes } from './routes/admin-routes.js';
import { TenantService } from './services/tenant-service.js';
import type { TenantDb, TenantRecord } from './services/tenant-service.js';

// Phase 5: Audit
import { AuditLogger } from './audit/audit-logger.js';
import type { AuditStore, AuditEvent, SecurityEvent, AuditQuery } from './audit/audit-logger.js';

// Phase 6: Templates
import { TemplateService } from './services/template-service.js';
import type { TemplateStore, TemplateRecord } from './services/template-service.js';
import { templateRoutes } from './routes/template-routes.js';

// Phase 6: White-label theming
import { ThemeService } from './services/theme-service.js';
import type { ThemeStore, ThemeConfig } from './services/theme-service.js';
import { themeRoutes } from './routes/theme-routes.js';

// Phase 6: API Documentation
import { docsRoutes } from './routes/docs-routes.js';

// Phase 6: Health, Error Handler, Version, Monitoring
import { HealthService } from './services/health-service.js';
import { healthRoutes as healthRoutesV2 } from './routes/health-routes.js';
import { ErrorHandlerService } from './services/error-handler.js';
import type { ErrorStore, ExecutionError } from './services/error-handler.js';
import { VersionService } from './services/version-service.js';
import type { VersionStore, WorkflowVersion } from './services/version-service.js';
import { MonitoringService } from './services/monitoring-service.js';

// ---------------------------------------------------------------------------
// In-memory stub implementations (replaced with real DB implementations later)
// ---------------------------------------------------------------------------

/** In-memory AuditStore for development/testing */
class InMemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];
  private securityEvents: SecurityEvent[] = [];

  async saveEvent(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async saveSecurityEvent(event: SecurityEvent): Promise<void> {
    this.securityEvents.push(event);
  }

  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    let results = this.events.filter((e) => e.tenantId === query.tenantId);
    if (query.action) results = results.filter((e) => e.action === query.action);
    if (query.resourceType) results = results.filter((e) => e.resourceType === query.resourceType);
    if (query.startDate) results = results.filter((e) => e.timestamp >= query.startDate!);
    if (query.endDate) results = results.filter((e) => e.timestamp <= query.endDate!);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async querySecurityEvents(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<SecurityEvent[]> {
    let results = this.securityEvents.filter((e) => e.tenantId === tenantId);
    if (startDate) results = results.filter((e) => e.timestamp >= startDate);
    if (endDate) results = results.filter((e) => e.timestamp <= endDate);
    return results;
  }
}

/** In-memory UsageStore for development/testing */
class InMemoryUsageStore implements UsageStore {
  private data = new Map<
    string,
    { workflowCount: number; executionCount: number; executionMinutes: number }
  >();

  private getOrCreate(tenantId: string) {
    let record = this.data.get(tenantId);
    if (!record) {
      record = { workflowCount: 0, executionCount: 0, executionMinutes: 0 };
      this.data.set(tenantId, record);
    }
    return record;
  }

  async incrementWorkflowCount(tenantId: string, delta: number): Promise<void> {
    const r = this.getOrCreate(tenantId);
    r.workflowCount += delta;
  }

  async incrementExecutionCount(tenantId: string): Promise<void> {
    const r = this.getOrCreate(tenantId);
    r.executionCount += 1;
  }

  async addExecutionMinutes(tenantId: string, minutes: number): Promise<void> {
    const r = this.getOrCreate(tenantId);
    r.executionMinutes += minutes;
  }

  async getCurrentUsage(tenantId: string): Promise<UsageRecord> {
    const r = this.getOrCreate(tenantId);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { tenantId, ...r, periodStart, periodEnd };
  }

  async getPeriodUsage(tenantId: string, start: Date, end: Date): Promise<UsageRecord> {
    const r = this.getOrCreate(tenantId);
    return { tenantId, ...r, periodStart: start, periodEnd: end };
  }
}

/** In-memory TenantDb for development/testing */
class InMemoryTenantDb implements TenantDb {
  private tenants = new Map<string, TenantRecord>();

  async create(
    tenant: Omit<TenantRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<TenantRecord> {
    const now = new Date();
    const record: TenantRecord = { ...tenant, createdAt: now, updatedAt: now };
    this.tenants.set(tenant.id, record);
    return record;
  }

  async getById(id: string): Promise<TenantRecord | null> {
    return this.tenants.get(id) ?? null;
  }

  async getByStripeCustomerId(customerId: string): Promise<TenantRecord | null> {
    for (const t of this.tenants.values()) {
      if (t.stripeCustomerId === customerId) return t;
    }
    return null;
  }

  async update(
    id: string,
    data: Partial<Pick<TenantRecord, 'name' | 'plan' | 'stripeCustomerId' | 'active'>>,
  ): Promise<TenantRecord | null> {
    const existing = this.tenants.get(id);
    if (!existing) return null;
    const updated: TenantRecord = { ...existing, ...data, updatedAt: new Date() };
    this.tenants.set(id, updated);
    return updated;
  }
}

/** In-memory TemplateStore for development/testing */
class InMemoryTemplateStore implements TemplateStore {
  private templates = new Map<string, TemplateRecord>();

  async create(template: TemplateRecord): Promise<TemplateRecord> {
    this.templates.set(template.id, template);
    return template;
  }

  async getById(id: string): Promise<TemplateRecord | null> {
    return this.templates.get(id) ?? null;
  }

  async listGlobal(): Promise<TemplateRecord[]> {
    return [...this.templates.values()].filter((t) => t.isGlobal);
  }

  async listByTenant(tenantId: string): Promise<TemplateRecord[]> {
    return [...this.templates.values()].filter(
      (t) => !t.isGlobal && t.tenantId === tenantId,
    );
  }

  async update(
    id: string,
    data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>>,
  ): Promise<TemplateRecord | null> {
    const existing = this.templates.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data } as TemplateRecord;
    this.templates.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.templates.delete(id);
  }
}

/** In-memory ThemeStore for development/testing */
class InMemoryThemeStore implements ThemeStore {
  private themes = new Map<string, ThemeConfig>();

  async get(tenantId: string): Promise<ThemeConfig | null> {
    return this.themes.get(tenantId) ?? null;
  }

  async save(theme: ThemeConfig): Promise<ThemeConfig> {
    this.themes.set(theme.tenantId, theme);
    return theme;
  }

  async delete(tenantId: string): Promise<boolean> {
    return this.themes.delete(tenantId);
  }
}

/** In-memory ErrorStore for development/testing */
class InMemoryErrorStore implements ErrorStore {
  private errors: ExecutionError[] = [];

  async save(error: ExecutionError): Promise<void> {
    this.errors.push(error);
  }

  async getById(id: string): Promise<ExecutionError | null> {
    return this.errors.find((e) => e.id === id) ?? null;
  }

  async getByTenant(tenantId: string, limit?: number): Promise<ExecutionError[]> {
    const filtered = this.errors.filter((e) => e.tenantId === tenantId);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  async getByWorkflow(tenantId: string, workflowId: string): Promise<ExecutionError[]> {
    return this.errors.filter((e) => e.tenantId === tenantId && e.workflowId === workflowId);
  }

  async update(id: string, data: Partial<ExecutionError>): Promise<ExecutionError | null> {
    const idx = this.errors.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    this.errors[idx] = { ...this.errors[idx]!, ...data };
    return this.errors[idx]!;
  }
}

/** In-memory VersionStore for development/testing */
class InMemoryVersionStore implements VersionStore {
  private versions: WorkflowVersion[] = [];

  async save(version: WorkflowVersion): Promise<WorkflowVersion> {
    this.versions.push(version);
    return version;
  }

  async getById(id: string): Promise<WorkflowVersion | null> {
    return this.versions.find((v) => v.id === id) ?? null;
  }

  async getByWorkflowAndVersion(workflowId: string, version: number): Promise<WorkflowVersion | null> {
    return this.versions.find((v) => v.workflowId === workflowId && v.version === version) ?? null;
  }

  async listByWorkflow(workflowId: string, tenantId: string): Promise<WorkflowVersion[]> {
    return this.versions.filter((v) => v.workflowId === workflowId && v.tenantId === tenantId);
  }

  async getLatest(workflowId: string, tenantId: string): Promise<WorkflowVersion | null> {
    const filtered = this.versions.filter(
      (v) => v.workflowId === workflowId && v.tenantId === tenantId,
    );
    return filtered.length > 0 ? filtered[filtered.length - 1]! : null;
  }

  async update(id: string, data: Partial<WorkflowVersion>): Promise<WorkflowVersion | null> {
    const idx = this.versions.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    this.versions[idx] = { ...this.versions[idx]!, ...data };
    return this.versions[idx]!;
  }
}

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

// --- Phase 5 singletons (module-level for access across the server) ---
const inMemoryAuditStore = new InMemoryAuditStore();
const auditLogger = new AuditLogger(inMemoryAuditStore);

const inMemoryUsageStore = new InMemoryUsageStore();
const usageTracker = new UsageTracker(inMemoryUsageStore);
const planLimitsEnforcer = new PlanLimitsEnforcer(usageTracker);

const inMemoryTenantDb = new InMemoryTenantDb();
const tenantService = new TenantService(inMemoryTenantDb);

// Adapter: TenantService -> TenantServiceInterface (return types differ: TenantRecord|null vs void)
const tenantServiceAdapter: TenantServiceInterface = {
  async setStripeCustomerId(tenantId: string, customerId: string): Promise<void> {
    await tenantService.setStripeCustomerId(tenantId, customerId);
  },
  async updatePlan(tenantId: string, plan: string): Promise<void> {
    await tenantService.updatePlan(tenantId, plan);
  },
  async getByStripeCustomerId(customerId: string) {
    return tenantService.getByStripeCustomerId(customerId);
  },
};

const stripeWebhookHandler = new StripeWebhookHandler(tenantServiceAdapter, usageTracker);

// --- Phase 6 singletons ---
const inMemoryTemplateStore = new InMemoryTemplateStore();
const templateService = new TemplateService(inMemoryTemplateStore);

const inMemoryThemeStore = new InMemoryThemeStore();
const themeService = new ThemeService(inMemoryThemeStore);

const healthService = new HealthService();

const inMemoryErrorStore = new InMemoryErrorStore();
const errorHandlerService = new ErrorHandlerService(inMemoryErrorStore);

const inMemoryVersionStore = new InMemoryVersionStore();
const versionService = new VersionService(inMemoryVersionStore);

const monitoringService = new MonitoringService();

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

  // --- Phase 5: Security middleware (registered early, applies globally) ---
  // Wrapped with fastify-plugin so hooks apply across all scopes
  await app.register(securityMiddleware, {
    enforceContentType: true,
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : undefined,
  });

  // --- Bootstrap n8n DI container (once, before routes) ---
  // This initializes InstanceSettings, BinaryDataService, etc.
  // Idempotent: safe to call multiple times (no-op after first).
  await ensureBootstrapped();

  // --- Decorate the app with Phase 5 services for route access ---
  app.decorate('auditLogger', auditLogger);
  app.decorate('usageTracker', usageTracker);
  app.decorate('planLimitsEnforcer', planLimitsEnforcer);
  app.decorate('tenantService', tenantService);

  // --- Decorate the app with Phase 6 services for route access ---
  app.decorate('errorHandlerService', errorHandlerService);
  app.decorate('versionService', versionService);
  app.decorate('monitoringService', monitoringService);
  app.decorate('healthService', healthService);

  // --- Public routes (no auth) ---

  await app.register(healthRoutes);

  // --- Phase 6: Enhanced health routes (public, no auth) ---
  await app.register(healthRoutesV2, { healthService });

  // --- Phase 6: API Documentation routes (public, no auth) ---
  await app.register(docsRoutes);

  // --- Phase 4: Webhook routes (public -- external callers use signature verification, not JWT) ---

  const webhookRegistry = new WebhookRegistry();
  const webhookRouter = new WebhookRouter(webhookRegistry, stubExecutionQueue);
  await app.register(webhookRoutes(webhookRouter));

  // --- Phase 5: Billing webhook route (public -- Stripe sends its own signature) ---
  // Registered at the top level (before auth hook) since Stripe uses its own signature verification.

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

  await app.register(billingRoutes, {
    stripeSecretKey,
    stripeWebhookSecret,
    webhookHandler: stripeWebhookHandler,
  });

  // --- Auth hook for /api/* routes (excluding billing webhook and admin which have own auth) ---

  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for billing webhook (Stripe uses its own signature verification)
    if (request.url.startsWith('/api/billing/webhook')) return;
    // Skip auth for admin routes (they use API key auth)
    if (request.url.startsWith('/api/admin/')) return;
    // Skip auth for API documentation routes (public)
    if (request.url.startsWith('/api/docs')) return;
    // Skip auth for health/metrics endpoints (public)
    if (request.url.startsWith('/api/health')) return;
    if (request.url.startsWith('/api/metrics')) return;

    if (request.url.startsWith('/api/')) {
      await authMiddleware(request, reply);
    }
  });

  // --- Authenticated API routes ---

  await app.register(workflowRoutes);
  await app.register(credentialRoutes);
  await app.register(executionRoutes);
  await app.register(nodeRoutes);

  // --- Phase 6: Template routes ---
  await app.register(templateRoutes, { templateService });

  // --- Phase 6: Theme routes ---
  await app.register(themeRoutes, { themeService });

  // --- Phase 5: Admin routes (behind API key auth, in a scoped register) ---

  const adminApiKey = process.env.ADMIN_API_KEY ?? 'r360-dev-admin-key';

  await app.register(adminRoutes, {
    adminApiKey,
    tenantService,
  });

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

  // --- Phase 5: Log Phase 5 services status ---
  app.log.info('Phase 5 services wired: AuditLogger, UsageTracker, PlanLimitsEnforcer, TenantService, StripeWebhookHandler, SecurityMiddleware');

  // --- Phase 6: Log Phase 6 services status ---
  app.log.info('Phase 6 services wired: TemplateService, ThemeService, HealthService, ErrorHandlerService, VersionService, MonitoringService, DocsRoutes');

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
