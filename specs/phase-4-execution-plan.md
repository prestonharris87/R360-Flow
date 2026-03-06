# Phase 4 Execution Plan: Execution Infrastructure

## Summary

Phase 4 builds production-grade infrastructure around the n8n execution engine. It delivers: Redis-backed BullMQ job queue with per-tenant rate limiting and priority, code sandbox with timeout enforcement, tenant-scoped webhook routing with signature verification and lifecycle management, cron-based scheduled workflow system with timezone support, WebSocket-based real-time execution monitoring, and full API server wiring.

**Cardinal Rule:** n8n packages are UNMODIFIED npm dependencies. All infrastructure wraps AROUND n8n execution -- BullMQ queue, rate limiting, webhook routing, scheduling, and real-time monitoring are OUR responsibility. `WorkflowExecute.run()` is the innermost call; everything else is our scaffolding. We NEVER fork, patch, or modify n8n packages.

**Prerequisites:** Phase 3 complete -- n8n DI bootstrap, node registry, execution service, credential helper, lifecycle hooks, and JSON translator all functional and tested.

**Duration Estimate:** 2-3 weeks (Weeks 7-9)

## Task Dependency Graph

```
Task 1 (Install Dependencies) ────────────┬────────────────────────────────┬───────────────┐
                                           |                                |               |
                                           v                                v               v
                                    Task 2 (Queue Config)            Task 5 (Sandbox)   Task 6 (Webhook Registry)
                                           |                                |               |
                                           v                                |               v
                                    Task 3 (Execution Queue) ───────────────|        Task 7 (Webhook Router)
                                           |                                |               |
                                           v                                |               |
                                    Task 4 (Execution Worker)               |               |
                                           |                                |               |
                    ┌──────────────────────┬┘                               |               |
                    |                      |                                |               |
                    v                      v                                |               |
             Task 8 (Cron Eval)    Task 10 (Exec Monitor)                  |               |
                    |                      |                                |               |
                    v                      v                                |               |
             Task 9 (Scheduler)    Task 11 (WS Server)                     |               |
                    |                      |                                |               |
                    └──────────────────────┴────────────────────────────────┴───────────────┘
                                           |
                                           v
                                    Task 12 (Export & Wire Up)
                                           |
                                           v
                                    Task 13 (Final Validation)
```

## Tasks

### Task 1: Install Phase 4 Dependencies

**Description:** Install all runtime and dev dependencies required for Phase 4 features across the appropriate workspace packages. Verify Redis service already exists in docker-compose (it does). Note: we use Node.js `vm` module instead of `isolated-vm` to avoid complex native dependency builds.

**Size:** Small | **Dependencies:** None

**Files to modify:**
- `packages/execution-engine/package.json` -- add bullmq, ioredis
- `packages/api/package.json` -- add cron-parser, luxon, ws; add @types/ws, @types/luxon as devDeps
- `infrastructure/docker-compose.yml` -- verify Redis service present (already exists with health checks)

**Commands:**
```bash
cd /Users/preston/Documents/Claude/R360-Flow
pnpm --filter @r360/execution-engine add bullmq ioredis
pnpm --filter @r360/api add cron-parser luxon ws
pnpm --filter @r360/api add -D @types/ws @types/luxon
```

**Acceptance Criteria:**
- `pnpm install` from repo root succeeds with no errors
- `bullmq` and `ioredis` appear in `@r360/execution-engine` dependencies
- `cron-parser`, `luxon`, and `ws` appear in `@r360/api` dependencies
- `@types/ws` and `@types/luxon` appear in `@r360/api` devDependencies
- Redis service in `infrastructure/docker-compose.yml` is present with health check
- `docker compose -f infrastructure/docker-compose.yml up -d redis` starts Redis on port 6379
- `redis-cli ping` returns `PONG`
- No `isolated-vm` installed (we use Node.js `vm` module instead)

---

### Task 2: Queue Config

**Description:** Create queue configuration types and helper functions. Defines tenant plan tiers, per-plan concurrency/rate/timeout limits, priority mapping, and default queue settings for BullMQ.

**Size:** Small | **Dependencies:** Task 1

**Files to create:**
- `packages/execution-engine/src/queue/queue-config.ts`
- `packages/execution-engine/src/__tests__/queue/queue-config.test.ts`

**Key types and exports:**
- `TenantPlan` -- `'free' | 'pro' | 'enterprise'`
- `TenantLimits` -- `{ maxConcurrent, maxPerMinute, maxWorkflowTimeoutMs, maxNodeTimeoutMs }`
- `QueueConfig` -- `{ queueName, redis: { host, port, password?, tls? }, defaultJobOptions }`
- `getPriorityForPlan(plan)` -- returns BullMQ priority (lower = higher: enterprise=1, pro=5, free=10)
- `getLimitsForPlan(plan)` -- returns `TenantLimits` for given plan tier
- `createDefaultQueueConfig()` -- returns sensible defaults reading from env vars

**Plan limits:**
| Plan | maxConcurrent | maxPerMinute | maxWorkflowTimeoutMs | maxNodeTimeoutMs |
|------|---------------|--------------|----------------------|------------------|
| free | 2 | 10 | 300,000 (5 min) | 30,000 (30s) |
| pro | 10 | 60 | 900,000 (15 min) | 60,000 (1 min) |
| enterprise | 50 | 300 | 3,600,000 (60 min) | 300,000 (5 min) |

**Acceptance Criteria:**
- `getPriorityForPlan('enterprise')` returns 1, `'pro'` returns 5, `'free'` returns 10
- `getLimitsForPlan()` returns correct limits for each tier (see table above)
- `createDefaultQueueConfig()` reads `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS` from env
- Default queue name is `'r360-workflow-executions'`
- Default job options include `attempts: 3`, exponential backoff, `removeOnComplete` and `removeOnFail` settings
- `pnpm --filter @r360/execution-engine test -- --grep "QueueConfig"` passes
- TypeScript compiles with no errors

---

### Task 3: Execution Queue

**Description:** Create the `ExecutionQueue` class that wraps BullMQ Queue with tenant-aware enqueuing, priority-based scheduling, per-tenant rate limiting, and per-tenant concurrency controls.

**Size:** Medium | **Dependencies:** Task 2

**Files to create:**
- `packages/execution-engine/src/queue/execution-queue.ts`
- `packages/execution-engine/src/__tests__/queue/execution-queue.test.ts`

**Key types and exports:**
- `ExecutionJobData` -- `{ tenantId, workflowId, executionId, triggerType, planTier?, inputData?, timeoutMs?, webhookData? }`
- `ExecutionQueue` class:
  - `constructor(redis: Redis, config?: Partial<QueueConfig>)`
  - `initialize()` / `shutdown()` -- lifecycle management
  - `enqueue(data: ExecutionJobData)` -- always enqueues with priority and timeout
  - `tryEnqueue(data: ExecutionJobData)` -- returns `boolean`, checks rate limit + concurrency before enqueue
  - `setTenantLimits(tenantId, limits)` -- override limits for specific tenant
  - `getActiveCountForTenant(tenantId)` -- query active jobs for tenant
  - `drain()`, `pause()`, `resume()` -- queue control
  - `createWorker(processor, options?)` -- create a BullMQ Worker for this queue
  - `onCompleted(handler)`, `onFailed(handler)` -- event subscriptions via QueueEvents

**Implementation notes:**
- Uses BullMQ `Queue` and `QueueEvents` with tenant-scoped Redis connections via `redis.duplicate()`
- Per-tenant rate limiting uses in-memory sliding window (1-minute window)
- Priority uses BullMQ's built-in priority (lower number = higher priority)
- Timeout is capped at the plan's `maxWorkflowTimeoutMs`
- Job grouping by tenant ID for concurrency control

**IMPORTANT:** Tests require a running Redis instance. Mark as integration tests and configure accordingly.

**Acceptance Criteria:**
- Jobs enqueue with correct data payload, priority, and timeout
- Priority ordering: enterprise (1) < pro (5) < free (10) -- enterprise jobs processed first
- `tryEnqueue` returns `false` when rate limit exceeded (maxPerMinute)
- `tryEnqueue` returns `false` when concurrency limit exceeded (maxConcurrent)
- `setTenantLimits` overrides default plan limits for a specific tenant
- `onCompleted` and `onFailed` event handlers fire correctly
- Queue `drain()`, `pause()`, `resume()`, `shutdown()` work cleanly
- `pnpm --filter @r360/execution-engine test:integration -- --grep "ExecutionQueue"` passes with Redis running

---

### Task 4: Execution Worker

**Description:** Create the `ExecutionWorker` class that wraps a BullMQ Worker, processing queued execution jobs by calling the Phase 3 `ExecutionService`. Includes progress tracking and graceful shutdown.

**Size:** Small | **Dependencies:** Task 3

**Files to create:**
- `packages/execution-engine/src/queue/execution-worker.ts`
- `packages/execution-engine/src/__tests__/queue/execution-worker.test.ts`

**Key types and exports:**
- `ExecutionWorkerOptions` -- `{ concurrency, redis, queueName, executionService }`
- `ExecutionWorker` class:
  - `constructor(options: ExecutionWorkerOptions)`
  - `processJob(job: Job<ExecutionJobData>)` -- private; calls `executionService.execute()`
  - `shutdown()` -- graceful worker close
  - Progress tracking via `job.updateProgress(0)` at start, `job.updateProgress(100)` at completion

**Implementation notes:**
- Worker calls `executionService.execute()` with `{ tenantId, workflowId, executionId, inputData }`
- On execution error, logs and re-throws so BullMQ handles retries per `defaultJobOptions.attempts`
- Worker error handler logs errors to console (later: structured logging)
- Tests can mock `ExecutionService` -- no Redis required for unit tests

**Acceptance Criteria:**
- Worker processes jobs by delegating to `ExecutionService.execute()`
- Progress updates at 0 (start) and 100 (completion) via `job.updateProgress()`
- Errors are logged with tenant/workflow/execution IDs and re-thrown
- Graceful `shutdown()` closes the BullMQ Worker
- Worker `concurrency` is configurable (default: 5)
- Unit tests pass with mocked ExecutionService and mocked BullMQ Worker

---

### Task 5: Code Sandbox

**Description:** Create a code sandbox using Node.js `vm` module (not `isolated-vm` -- avoids native dependency complexity) for safe execution of user-provided Code node scripts. Includes timeout enforcement at both per-node and per-workflow granularity.

**Size:** Medium | **Dependencies:** Task 1

**Files to create:**
- `packages/execution-engine/src/sandbox/code-sandbox.ts`
- `packages/execution-engine/src/sandbox/timeout-manager.ts`
- `packages/execution-engine/src/__tests__/sandbox/code-sandbox.test.ts`
- `packages/execution-engine/src/__tests__/sandbox/timeout-manager.test.ts`

**CodeSandbox class:**
- `SandboxConfig` -- `{ memoryLimitMb, timeoutMs, allowedModules }`
- `execute(code: string, inputData: Record<string, unknown>)` -- runs code in sandboxed vm context
- Uses `vm.createContext()` with minimal globals (no `process`, `require`, `fetch`, `import`)
- Input data injected as frozen `$input` object
- Wraps user code in strict-mode IIFE
- Enforces timeout via `vm.runInContext()` timeout option
- Blocks access to `process`, `require`, `fetch`, file system, and network

**TimeoutManager class:**
- `TimeoutConfig` -- `{ nodeTimeoutMs, workflowTimeoutMs }`
- `startWorkflowTimer(executionId, config)` -- start a workflow-level timeout timer
- `isWorkflowTimedOut(executionId)` -- check if workflow exceeded its timeout
- `clearWorkflowTimer(executionId)` -- clear a specific timer
- `withNodeTimeout(nodeId, config, operation)` -- wrap an async operation with per-node timeout
- `activeTimerCount()` -- return count of active workflow timers
- `clearAll()` -- cleanup all timers

**Implementation notes:**
- Using Node.js `vm` module instead of `isolated-vm` -- simpler setup, no native deps
- `vm` does not provide memory isolation (V8 heap is shared), but blocks dangerous globals
- For true memory isolation, `worker_threads` can be added later as enhancement
- Timeout for infinite loops relies on `vm.runInContext({ timeout })` which interrupts synchronous execution

**Acceptance Criteria:**
- Simple JavaScript executes and returns correct result
- Input data accessible via `$input` in sandbox
- `process`, `require`, `fetch`, `import()` are all blocked (throws error)
- Infinite loops terminated by timeout
- CPU-intensive operations terminated by timeout
- Per-node timeout enforced via `withNodeTimeout()`
- Per-workflow timeout tracks elapsed time across multiple node executions
- `activeTimerCount()` correctly tracks active timers
- `clearAll()` cleans up all timers
- `pnpm --filter @r360/execution-engine test -- --grep "CodeSandbox|TimeoutManager"` passes

---

### Task 6: Webhook Registry

**Description:** Create an in-memory webhook registry that maps `{tenantId}:{method}:{path}` to workflow registrations. Supports register, deregister, lookup, and bulk operations. Tenant isolation is enforced by key structure.

**Size:** Small | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/webhooks/webhook-registry.ts`
- `packages/api/src/__tests__/webhooks/webhook-registry.test.ts`

**Key types and exports:**
- `WebhookRegistration` -- `{ tenantId, workflowId, webhookPath, method, signatureSecret?, createdAt? }`
- `WebhookRegistry` class:
  - `register(registration)` -- register webhook, throws if duplicate path for same tenant+method
  - `deregister(tenantId, path, method)` -- remove a single webhook
  - `deregisterWorkflow(tenantId, workflowId)` -- remove all webhooks for a workflow
  - `lookup(tenantId, path, method)` -- find registration or undefined
  - `listForTenant(tenantId)` -- list all webhooks for a tenant

**Implementation notes:**
- In-memory `Map<string, WebhookRegistration>` keyed by `${tenantId}:${METHOD}:${path}`
- Method is normalized to uppercase in key generation
- In production, this will be backed by the `webhooks` DB table (Phase 1 schema)
- Tenant isolation is inherent in the key structure -- lookup always includes tenantId

**Acceptance Criteria:**
- Webhook registers with tenant + path + method
- Duplicate path per tenant+method rejected with error
- Same path allowed for different tenants
- `deregister()` removes a specific webhook
- `deregisterWorkflow()` removes all webhooks belonging to a workflow
- `lookup()` returns `undefined` for non-existent webhooks
- `listForTenant()` returns only webhooks for the specified tenant
- `pnpm --filter @r360/api test -- --grep "WebhookRegistry"` passes

---

### Task 7: Webhook Router + Lifecycle Manager

**Description:** Create the webhook router that handles incoming webhook requests with signature verification, and the lifecycle manager that registers/deregisters webhooks when workflows are activated/deactivated. Create Fastify route plugin for webhook endpoints.

**Size:** Medium | **Dependencies:** Task 6

**Files to create:**
- `packages/api/src/webhooks/webhook-router.ts`
- `packages/api/src/webhooks/webhook-lifecycle.ts`
- `packages/api/src/routes/webhook-routes.ts`
- `packages/api/src/__tests__/webhooks/webhook-router.test.ts`
- `packages/api/src/__tests__/webhooks/webhook-lifecycle.test.ts`

**WebhookRouter class:**
- `WebhookRequest` -- `{ tenantId, path, method, headers, body, rawBody?, query? }`
- `WebhookResponse` -- `{ status: 'accepted' | 'not_found' | 'unauthorized' | 'error', executionId?, message? }`
- `constructor(registry, executionQueue)` -- takes WebhookRegistry and ExecutionQueue interface
- `handleWebhook(request)` -- lookup, verify signature (HMAC SHA-256), enqueue execution
- `static computeSignature(payload, secret)` -- HMAC SHA-256 hex digest
- Signature verification uses `crypto.timingSafeEqual()` to prevent timing attacks

**WebhookLifecycleManager class:**
- `onWorkflowActivate(tenantId, workflowId, workflowDefinition)` -- scan nodes for webhook triggers, register each
- `onWorkflowDeactivate(tenantId, workflowId)` -- deregister all webhooks for workflow
- `onWorkflowUpdate(tenantId, workflowId, workflowDefinition)` -- deregister then re-register
- Recognizes webhook trigger node types: `n8n-nodes-base.webhook`, `r360.webhookTrigger`

**webhook-routes.ts (Fastify plugin):**
- Route: `ALL /webhook/:tenantId/*` -- catches all methods and sub-paths
- Extracts `tenantId` from params, webhook path from wildcard
- Maps `WebhookResponse.status` to HTTP status codes: accepted->202, not_found->404, unauthorized->401, error->500

**Acceptance Criteria:**
- Webhook hit triggers execution queue enqueue with `triggerType: 'webhook'`
- Unknown webhook path returns `not_found`
- Cross-tenant webhook access returns `not_found` (tenant isolation)
- Valid HMAC SHA-256 signature accepted
- Invalid signature returns `unauthorized`
- Missing signature when secret is configured returns `unauthorized`
- No signature check when no secret is configured (open webhook)
- Lifecycle: activate registers webhooks, deactivate removes them
- Lifecycle: update deregisters old + registers new webhooks
- Fastify plugin route correctly maps status to HTTP codes
- `pnpm --filter @r360/api test -- --grep "WebhookRouter|WebhookLifecycle"` passes

---

### Task 8: Cron Evaluator

**Description:** Create a cron expression evaluator using `cron-parser` and `luxon` for timezone-aware scheduling. Validates expressions, calculates next/previous run times, and determines if a scheduled workflow is due.

**Size:** Small | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/scheduler/cron-evaluator.ts`
- `packages/api/src/__tests__/scheduler/cron-evaluator.test.ts`

**CronEvaluator class:**
- `isValidExpression(expression)` -- returns boolean
- `getNextRunTime(expression, timezone, from?)` -- returns `Date | undefined`
- `getPreviousRunTime(expression, timezone, from?)` -- returns `Date | undefined`
- `isDue(expression, timezone, lastRunAt, now?)` -- returns boolean
  - Logic: get previous scheduled time from `now`, check if it is after `lastRunAt`
  - `lastRunAt === null` means never run, always due

**Implementation notes:**
- Uses `cron-parser` for expression parsing and iteration
- `timezone` parameter passed to `cron-parser` via `tz` option
- `luxon` available for timezone conversion if needed
- Standard 5-field cron: `minute hour day-of-month month day-of-week`
- Supports expressions like `0 9 * * MON-FRI`, `*/5 * * * *`, `0 0 1 * *`

**Acceptance Criteria:**
- Valid cron expressions (`0 9 * * *`, `*/5 * * * *`, `0 9 * * MON-FRI`) return `true` from `isValidExpression`
- Invalid expressions (`invalid`, `60 25 * * *`) return `false`
- `getNextRunTime('0 9 * * *', 'UTC', 08:00)` returns 09:00 same day
- `getNextRunTime('*/5 * * * *', 'UTC', 08:03)` returns 08:05
- Timezone-aware: `getNextRunTime('0 9 * * *', 'America/New_York', ...)` correctly offsets to UTC
- `isDue` returns `true` when previous scheduled time is after `lastRunAt`
- `isDue` returns `false` when workflow already ran in current scheduled window
- `isDue` returns `true` when `lastRunAt` is `null` (never run)
- `pnpm --filter @r360/api test -- --grep "CronEvaluator"` passes

---

### Task 9: Scheduler Service

**Description:** Create a scheduler service that polls the database for active scheduled workflows, checks if each is due using `CronEvaluator`, and enqueues due workflows via the execution queue. Supports start/stop polling lifecycle.

**Size:** Medium | **Dependencies:** Task 8, Task 3

**Files to create:**
- `packages/api/src/scheduler/scheduler-service.ts`
- `packages/api/src/__tests__/scheduler/scheduler-service.test.ts`

**Key types and interfaces:**
- `ScheduledWorkflow` -- `{ id, tenantId, cronExpression, timezone, lastRunAt }`
- `SchedulerDb` interface -- `{ getActiveScheduledWorkflows(), updateLastRunAt(workflowId, runAt) }`
- `SchedulerExecutionQueue` interface -- `{ enqueue(data) }`

**SchedulerService class:**
- `constructor(db: SchedulerDb, executionQueue: SchedulerExecutionQueue)`
- `checkAndEnqueue(now?)` -- one poll cycle: get active workflows, check each for due, enqueue, update lastRunAt
- `start(pollIntervalMs?)` -- start polling loop (default: 30s)
- `stop()` -- stop polling loop
- `isRunning()` -- check if scheduler is active

**Implementation notes:**
- Uses `setInterval` for polling (simple, sufficient for single-instance)
- Errors in processing one workflow do not stop processing of others (try/catch per workflow)
- Execution ID format: `exec-sched-{timestamp}-{randomHex}`
- `updateLastRunAt` called after successful enqueue to prevent duplicate runs
- Tests use mocked DB and execution queue -- no Redis required

**Acceptance Criteria:**
- `checkAndEnqueue` detects due workflows and enqueues them
- `checkAndEnqueue` updates `lastRunAt` after successful enqueue
- Workflows that are not due are not enqueued
- Errors in one workflow do not prevent processing of other workflows
- `start()` begins polling at configured interval
- `stop()` stops the polling loop
- Calling `start()` twice throws error
- `isRunning()` reflects current state
- `pnpm --filter @r360/api test -- --grep "SchedulerService"` passes

---

### Task 10: Execution Monitor

**Description:** Create an in-memory pub/sub execution monitor for real-time event delivery. Supports per-execution and per-tenant subscriptions with tenant isolation.

**Size:** Small | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/realtime/execution-monitor.ts`
- `packages/api/src/__tests__/realtime/execution-monitor.test.ts`

**Key types and exports:**
- `ExecutionEventType` -- `'workflow_started' | 'node_started' | 'node_completed' | 'workflow_completed' | 'workflow_error' | 'node_error' | 'log'`
- `ExecutionEvent` -- `{ executionId, tenantId, type, nodeId?, nodeName?, outputData?, error?, status?, durationMs?, progress?, logMessage?, logLevel?, timestamp }`
- `ExecutionMonitor` class:
  - `subscribe(tenantId, executionId, callback)` -- returns unsubscribe function
  - `subscribeTenant(tenantId, callback)` -- subscribe to ALL executions for a tenant
  - `emit(event)` -- deliver event to matching subscribers
  - `getSubscriberCount(tenantId, executionId)` -- for debugging/monitoring

**Implementation notes:**
- Execution subscribers keyed by `${tenantId}:${executionId}` -- inherent tenant isolation
- Tenant-wide subscribers keyed by `tenantId`
- Emit delivers to both execution-specific and tenant-wide subscribers
- Subscriber errors caught and logged, do not propagate

**Acceptance Criteria:**
- `subscribe` returns a callable unsubscribe function
- Events delivered to matching execution subscribers
- Events NOT delivered after unsubscribe
- Tenant isolation: tenant-1 events not delivered to tenant-2 subscribers
- Execution isolation: exec-1 events not delivered to exec-2 subscribers of same tenant
- `subscribeTenant` receives events from ALL executions of that tenant
- All event types handled: `workflow_started`, `node_started`, `node_completed`, `workflow_completed`, `workflow_error`
- Events include optional fields: `nodeId`, `nodeName`, `outputData`, `durationMs`, `error`
- Subscriber errors caught, do not crash monitor
- `pnpm --filter @r360/api test -- --grep "ExecutionMonitor"` passes

---

### Task 11: WebSocket Server

**Description:** Create a WebSocket server for real-time execution monitoring. Authenticates clients via token, enforces tenant isolation, and delivers execution events as JSON messages. Includes heartbeat for connection health.

**Size:** Medium | **Dependencies:** Task 10

**Files to create:**
- `packages/api/src/realtime/ws-server.ts`
- `packages/api/src/realtime/execution-hooks-integration.ts`
- `packages/api/src/__tests__/realtime/ws-server.test.ts`

**createExecutionWSServer function:**
- Parameters: `(server: http.Server, monitor: ExecutionMonitor, options: WSServerOptions)`
- `WSServerOptions` -- `{ authenticateToken: (token) => Promise<AuthResult | null>, heartbeatIntervalMs? }`
- Returns `WebSocketServer` instance

**Client connection flow:**
1. Client connects with `?token=xxx` query parameter
2. Token validated via `authenticateToken` callback
3. Invalid/missing token: close with code 4001
4. Valid token: connection established with `ClientState { tenantId, userId, subscriptions, isAlive }`

**Client message protocol (JSON):**
- `{ action: 'subscribe', executionId: '...' }` -- subscribe to execution updates
- `{ action: 'unsubscribe', executionId: '...' }` -- unsubscribe from execution
- `{ action: 'subscribe_tenant' }` -- subscribe to all tenant executions
- `{ action: 'unsubscribe_tenant' }` -- unsubscribe from tenant-wide updates

**Heartbeat:**
- Server pings clients at `heartbeatIntervalMs` (default: 30s)
- If client does not respond with pong, connection terminated
- Client pong resets `isAlive` flag

**execution-hooks-integration.ts:**
- `createMonitoringHooks(monitor)` -- returns hook functions that bridge execution engine lifecycle events to the monitor
- Hooks: `workflowExecuteBefore`, `nodeExecuteBefore`, `nodeExecuteAfter`, `workflowExecuteAfter`

**Acceptance Criteria:**
- Authenticated WebSocket connections accepted (readyState = OPEN)
- Unauthenticated connections closed with code 4001
- Client subscribes to execution, receives events as JSON when emitted
- Events from other tenants NOT delivered (tenant isolation enforced)
- Heartbeat pings sent at configured interval
- Unresponsive clients terminated after missed pong
- Client disconnect cleans up all subscriptions
- `subscribe_tenant` receives events from all tenant executions
- Multiple clients can subscribe to same execution independently
- `pnpm --filter @r360/api test -- --grep "WebSocket"` passes

---

### Task 12: Export & Wire Up

**Description:** Update barrel exports, wire webhook routes into the API server, integrate scheduler start/stop into server lifecycle, and attach WebSocket server to the HTTP server.

**Size:** Medium | **Dependencies:** Tasks 3, 4, 5, 7, 9, 11

**Files to modify:**
- `packages/execution-engine/src/index.ts` -- add queue and sandbox exports
- `packages/api/src/server.ts` -- wire webhook routes, scheduler, WebSocket server

**Files to create:**
- `packages/api/src/services/scheduler-bridge.ts` -- optional: bridge module to instantiate scheduler with real DB queries
- `packages/api/src/services/webhook-bridge.ts` -- optional: bridge module to instantiate webhook registry + router

**Execution engine exports to add:**
```
// Queue
export { ExecutionQueue } from './queue/execution-queue.js';
export type { ExecutionJobData } from './queue/execution-queue.js';
export { ExecutionWorker } from './queue/execution-worker.js';
export type { ExecutionWorkerOptions } from './queue/execution-worker.js';
export { getPriorityForPlan, getLimitsForPlan, createDefaultQueueConfig } from './queue/queue-config.js';
export type { TenantPlan, TenantLimits, QueueConfig } from './queue/queue-config.js';

// Sandbox
export { CodeSandbox } from './sandbox/code-sandbox.js';
export type { SandboxConfig } from './sandbox/code-sandbox.js';
export { TimeoutManager } from './sandbox/timeout-manager.js';
export type { TimeoutConfig } from './sandbox/timeout-manager.js';
```

**API server wiring in `server.ts`:**
1. Register webhook routes (Fastify plugin, no auth -- webhooks use signature verification)
2. Initialize `WebhookRegistry`, `WebhookRouter`, `WebhookLifecycleManager`
3. Initialize `SchedulerService`, start polling on server listen, stop on server close
4. Create HTTP server from Fastify, attach `createExecutionWSServer`
5. Initialize `ExecutionMonitor`, wire into lifecycle hooks

**Server lifecycle:**
- On startup: `scheduler.start()`, WebSocket server attached
- On shutdown: `scheduler.stop()`, WebSocket server close, execution queue shutdown

**Acceptance Criteria:**
- `packages/execution-engine/src/index.ts` exports all queue and sandbox modules
- `import { ExecutionQueue, CodeSandbox, TimeoutManager } from '@r360/execution-engine'` works
- Webhook routes accessible at `ALL /webhook/:tenantId/*` without auth middleware
- Scheduler starts polling when server starts
- Scheduler stops when server shuts down
- WebSocket server accepts connections on the same port as HTTP server
- Graceful shutdown: scheduler stop -> WebSocket close -> queue shutdown
- `pnpm -r build` succeeds with no TypeScript errors

---

### Task 13: Final Validation

**Description:** Run comprehensive validation: Cardinal Rule check, TypeScript compilation, all unit tests, integration tests (with Redis), and fix any errors discovered.

**Size:** Small | **Dependencies:** All other tasks

**Files to create:**
- `scripts/validate-phase4.sh` -- validation script

**Validation steps:**
```bash
# 1. Cardinal Rule check
bash scripts/check-cardinal-rule.sh

# 2. TypeScript compilation (all packages)
pnpm -r build

# 3. TypeScript strict check
pnpm -r typecheck

# 4. Unit tests (no Redis required)
pnpm --filter @r360/execution-engine test
pnpm --filter @r360/api test

# 5. Integration tests (Redis required)
pnpm --filter @r360/execution-engine test:integration

# 6. Lint
pnpm -r lint
```

**Acceptance Criteria:**
- Cardinal Rule check passes: no imports from `n8n/` source paths, no n8n forks or patches
- `pnpm -r build` succeeds across all packages
- `pnpm -r typecheck` passes with zero errors
- All unit tests pass: queue config, sandbox, timeout manager, webhook registry, webhook router, webhook lifecycle, cron evaluator, scheduler service, execution monitor
- Integration tests pass (with Redis running): execution queue, WebSocket server
- `pnpm -r lint` passes with no errors
- No circular dependencies between packages
- All new files follow existing project conventions (ESM imports with `.js` extensions, Vitest test framework)

---

## Environment Variables (Phase 4)

```bash
# Redis (BullMQ) -- used by execution-engine
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# Execution Limits
MAX_CONCURRENT_EXECUTIONS_FREE=2
MAX_CONCURRENT_EXECUTIONS_PRO=10
MAX_CONCURRENT_EXECUTIONS_ENTERPRISE=50
DEFAULT_WORKFLOW_TIMEOUT_MS=300000    # 5 minutes
DEFAULT_NODE_TIMEOUT_MS=60000         # 1 minute
MAX_WORKFLOW_TIMEOUT_MS=3600000       # 1 hour

# Webhooks
WEBHOOK_BASE_URL=https://hooks.r360flow.com
WEBHOOK_SIGNATURE_SECRET=whsec_xxxxx

# WebSocket
WS_HEARTBEAT_INTERVAL_MS=30000

# Sandbox
SANDBOX_MEMORY_LIMIT_MB=128
SANDBOX_TIMEOUT_MS=10000
```

## Critical Warnings

1. **No isolated-vm:** We use Node.js `vm` module instead of `isolated-vm`. The `vm` module does not provide full memory isolation (V8 heap is shared), but it blocks dangerous globals (`process`, `require`, `fetch`). For production hardening, consider `worker_threads` with memory limits in a later phase.

2. **BullMQ Redis connection:** BullMQ requires `maxRetriesPerRequest: null` on the Redis connection. Always set this when creating `ioredis` instances for BullMQ. Use `redis.duplicate()` for separate connections per Queue/Worker/QueueEvents.

3. **BullMQ group feature:** The `group` option in `queue.add()` is a BullMQ Pro feature. If using open-source BullMQ, implement tenant concurrency limiting in the worker processor or via `tryEnqueue()` pre-checks instead.

4. **Signature timing safety:** `crypto.timingSafeEqual()` throws if buffers have different lengths. Ensure both signature strings are the same length before comparing, or hash both to a fixed-length digest first.

5. **Cron timezone edge cases:** DST transitions can cause cron jobs to fire twice or skip once. Document this behavior and test with DST boundary dates.

6. **WebSocket auth:** Token is passed via query string (`?token=xxx`). This means tokens appear in server logs and proxy logs. For production, consider upgrading to token-in-first-message or cookie-based auth.

7. **Scheduler single-instance:** The `setInterval` polling approach assumes a single scheduler instance. For multi-instance deployments, use Redis-based distributed locking (e.g., `redlock`) to prevent duplicate enqueues.

8. **ESM imports:** All file imports must use `.js` extension (e.g., `import { X } from './queue-config.js'`) per the project's ESM configuration.

## Parallel Execution Opportunities

The following tasks can run in parallel after Task 1 completes:
- **Group A:** Task 2 -> Task 3 -> Task 4 (queue pipeline)
- **Group B:** Task 5 (sandbox -- independent)
- **Group C:** Task 6 -> Task 7 (webhook pipeline)
- **Group D:** Task 8 (cron evaluator -- independent, but Task 9 needs Task 3)
- **Group E:** Task 10 -> Task 11 (realtime pipeline)

Maximum parallelism: Groups B, C, D, E can all start in parallel with Group A after Task 1.
