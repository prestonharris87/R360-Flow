# Phase 5 Execution Plan: Multi-Tenant Hardening

## Summary

Phase 5 hardens the platform for production multi-tenancy. It delivers: audit logging for sensitive data access and cross-tenant access attempts, SQL query audit to verify all queries include tenant_id filtering, Stripe billing integration with per-tenant usage metering and plan-based limit enforcement, tenant provisioning service with admin API, security middleware (input sanitization, CSRF protection, request size limiting), and an OWASP-aligned security test suite covering SQL injection, XSS, IDOR, rate limiting, and auth bypass.

**Cardinal Rule:** n8n packages are UNMODIFIED npm dependencies. Tenant isolation is entirely OUR responsibility. n8n libraries are tenant-unaware by design. Every boundary -- credentials, data storage, execution results, rate limits -- is enforced in OUR wrapper code. If a cross-tenant leak exists, the bug is in our code, not n8n's. This phase verifies that boundary is airtight. We NEVER fork, patch, or modify n8n packages.

**Prerequisites:** Phases 1-4 complete -- API server with tenant-aware data layer, Workflow Builder UI connected to API, n8n execution engine integrated, BullMQ queue with rate limiting, webhooks, scheduling, and real-time monitoring all functional and tested.

**Duration Estimate:** 2-3 weeks (Weeks 9-11)

## Task Dependency Graph

```
Task 1 (Install Dependencies) ────────┬──────────────────┬──────────────────┬──────────────────┐
                                       |                  |                  |                  |
                                       v                  v                  v                  v
                                Task 2 (Audit Logger)  Task 3 (Query Audit)  Task 4 (Usage Tracker)  Task 6 (Stripe Webhook)
                                       |                  |                  |                  |
                                       |                  |                  v                  |
                                       |                  |           Task 5 (Plan Limits)      |
                                       |                  |                  |                  |
                                       v                  v                  v                  v
                                Task 7 (Tenant Service)                            Task 8 (Security Middleware)
                                       |                                                       |
                                       └──────────────────────────┬────────────────────────────┘
                                                                  |
                                                                  v
                                                           Task 9 (Security Tests)
                                                                  |
                                                                  v
                                                           Task 10 (Wire Up & Export)
                                                                  |
                                                                  v
                                                           Task 11 (Final Validation)
```

## Tasks

### Task 1: Install Phase 5 Dependencies

**Description:** Install the Stripe SDK as a runtime dependency in the API package. Note: helmet/cors/rate-limit are already handled via Fastify equivalents (`@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`) which are already installed. We skip `argon2` (complex native dependency) in favor of Node.js built-in `crypto.scryptSync` which is already in use for key derivation.

**Size:** Small | **Dependencies:** None

**Files to modify:**
- `packages/api/package.json` -- add `stripe` as runtime dependency

**Commands:**
```bash
cd /Users/preston/Documents/Claude/R360-Flow
pnpm --filter @r360/api add stripe
```

**Acceptance Criteria:**
- `pnpm install` from repo root succeeds with no errors
- `stripe` appears in `@r360/api` dependencies
- No `argon2`, `helmet`, `cors`, or `express-rate-limit` installed (we use Fastify equivalents and Node.js built-in crypto)
- Existing Phase 1-4 tests still pass: `pnpm -r test`

---

### Task 2: Audit Logger

**Description:** Create an audit logging system for tracking sensitive data access events and cross-tenant access attempts. The audit logger writes events to an abstract `AuditStore` interface (allowing in-memory, PostgreSQL, or external logging backends). Security events (cross-tenant access attempts) are also written to stderr for immediate alerting.

**Size:** Small | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/audit/audit-logger.ts`
- `packages/api/src/__tests__/audit/audit-logger.test.ts`

**Key types and exports:**
- `AuditEvent` -- `{ tenantId, userId, action, resource, resourceId, timestamp, metadata?, ipAddress?, userAgent? }`
- `SecurityEvent` -- `{ tenantId, userId, attemptedTenantId, action, resource, resourceId, blocked, timestamp }`
- `AuditQuery` -- `{ tenantId, startDate, endDate, action?, resource?, userId?, limit?, offset? }`
- `AuditStore` interface -- `{ write(event: Record<string, unknown>): Promise<void>, query(params: AuditQuery): Promise<AuditEvent[]> }`
- `AuditLogger` class:
  - `constructor(store: AuditStore)`
  - `log(event: AuditEvent)` -- writes data access event with `type: 'data_access'`
  - `logSecurityEvent(event: SecurityEvent)` -- writes security event with `action: 'cross_tenant_access_attempt'` and logs to stderr
  - `query(params: AuditQuery)` -- queries audit logs by tenant and date range

**Implementation notes:**
- `AuditStore` is an interface; tests use a mock store (`vi.fn()`)
- `logSecurityEvent` transforms the SecurityEvent into a flat record with `type: 'security'` before writing
- `logSecurityEvent` also calls `console.error()` for immediate alerting with structured message: `[SECURITY] Cross-tenant access attempt: user=... tenant=... attempted_tenant=... resource=... blocked=...`
- All events include tenant scoping -- audit log queries always require `tenantId`

**Acceptance Criteria:**
- `log()` calls `store.write()` with the event augmented by `type: 'data_access'`
- `logSecurityEvent()` calls `store.write()` with `action: 'cross_tenant_access_attempt'` and `blocked` field
- `logSecurityEvent()` also logs to stderr via `console.error()`
- `query()` delegates to `store.query()` with the provided params
- `pnpm --filter @r360/api test -- --grep "Audit Logger"` passes
- TypeScript compiles with no errors

---

### Task 3: Query Audit Test

**Description:** Create a static analysis test that scans all source files in the `packages/db/src` directory for SQL queries and verifies that every query on tenant-scoped tables includes `tenant_id` filtering. This is a compile-time safety net -- no database connection required. Since the project uses Drizzle ORM, the test should also look for `.where()` calls with `eq(table.tenantId, ...)` patterns in addition to raw SQL strings.

**Size:** Small | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/__tests__/isolation/query-audit.test.ts`

**Key behavior:**
- Recursively finds all `.ts` files (excluding `.test.ts`) under `packages/db/src`
- Extracts SQL query patterns: `SELECT ... FROM`, `UPDATE ... SET`, `DELETE FROM`, `INSERT INTO`
- For multi-line queries, captures up to 10 lines ahead until `;` or `` `) `` terminator
- Checks each extracted query for `tenant_id` presence
- Exempts queries on tables that are legitimately tenant-unaware: `tenants`, `migrations`, `schema_versions`
- Reports violations with file path, line number, and truncated query text

**Regex patterns:**
- `/SELECT\s+.*\s+FROM\s+/i`
- `/UPDATE\s+.*\s+SET\s+/i`
- `/DELETE\s+FROM\s+/i`
- `/INSERT\s+INTO\s+/i`

**Acceptance Criteria:**
- Test scans all `.ts` files under `packages/db/src` (excluding test files)
- SELECT, UPDATE, DELETE queries on non-exempt tables must include `tenant_id`
- Exempt tables (`tenants`, `migrations`, `schema_versions`) are excluded from checks
- Violations are reported with file, line number, and query snippet
- If no DB source files exist yet, test passes vacuously (empty file list)
- `pnpm --filter @r360/api test -- --grep "Query Audit"` passes
- TypeScript compiles with no errors

---

### Task 4: Usage Tracker

**Description:** Create a usage tracking system that records per-tenant workflow creation/deletion, execution counts, and execution minutes. The tracker delegates storage to a `UsageStore` interface, allowing in-memory or PostgreSQL backends.

**Size:** Small | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/billing/usage-tracker.ts`
- `packages/api/src/__tests__/billing/usage-tracker.test.ts`

**Key types and exports:**
- `UsageSummary` -- `{ workflowCount: number, executionCount: number, executionMinutes: number }`
- `ExecutionUsage` -- `{ executionId: string, durationMs: number, status: 'success' | 'error' | 'cancelled' }`
- `UsageStore` interface:
  - `increment(tenantId: string, metric: string, value: number): Promise<void>`
  - `getUsage(tenantId: string): Promise<UsageSummary>`
  - `getPeriodUsage(tenantId: string, periodStart: Date, periodEnd: Date): Promise<{ executionCount: number, executionMinutes: number }>`
- `UsageTracker` class:
  - `constructor(store: UsageStore)`
  - `trackWorkflowCreated(tenantId)` -- increments `workflow_count` by 1
  - `trackWorkflowDeleted(tenantId)` -- decrements `workflow_count` by 1 (increment by -1)
  - `trackExecution(tenantId, execution: ExecutionUsage)` -- increments `execution_count` by 1 and `execution_minutes` by `durationMs / 60000`
  - `getCurrentUsage(tenantId)` -- returns current `UsageSummary`
  - `getPeriodUsage(tenantId)` -- returns current billing period usage (start of current month to now)

**Implementation notes:**
- `trackExecution` uses `Promise.all` to increment both `execution_count` and `execution_minutes` in parallel
- `getPeriodUsage` computes the billing period as the start of the current calendar month to now
- Tests use a mock `UsageStore` with `vi.fn()` -- no database required

**Acceptance Criteria:**
- `trackWorkflowCreated` calls `store.increment(tenantId, 'workflow_count', 1)`
- `trackWorkflowDeleted` calls `store.increment(tenantId, 'workflow_count', -1)`
- `trackExecution` increments both `execution_count` (by 1) and `execution_minutes` (by `durationMs / 60000`)
- `getCurrentUsage` returns the full `UsageSummary` from the store
- `getPeriodUsage` delegates to the store with correct billing period dates
- `pnpm --filter @r360/api test -- --grep "UsageTracker"` passes
- TypeScript compiles with no errors

---

### Task 5: Plan Limits Enforcer

**Description:** Create a plan limits enforcer that checks whether a tenant can create workflows or execute workflows based on their subscription plan. Supports free, pro, and enterprise tiers with configurable limits. Enterprise plan has unlimited access (limit = -1).

**Size:** Small | **Dependencies:** Task 4

**Files to create:**
- `packages/api/src/billing/plan-limits.ts`
- `packages/api/src/__tests__/billing/plan-limits.test.ts`

**Key types and exports:**
- `PlanLimits` -- `{ maxWorkflows: number, maxExecutionsPerMonth: number, maxExecutionMinutesPerMonth: number, maxCredentials: number }` (all numbers, -1 = unlimited)
- `LimitCheckResult` -- `{ allowed: boolean, reason?: string, currentUsage?: number, limit?: number }`
- `UsagePercentage` -- `{ workflows: number, executions: number, minutes: number }`
- `PlanLimitsEnforcer` class:
  - `constructor(usageTracker: UsageTrackerInterface, planLimits: Record<string, PlanLimits>)`
  - `canCreateWorkflow(tenantId, plan)` -- checks `workflowCount` against `maxWorkflows`
  - `canExecuteWorkflow(tenantId, plan)` -- checks `executionCount` against `maxExecutionsPerMonth` and `executionMinutes` against `maxExecutionMinutesPerMonth`
  - `getUsagePercentage(tenantId, plan)` -- returns percentage of each limit used (0 for unlimited dimensions)

**UsageTrackerInterface (dependency):**
- `getCurrentUsage(tenantId): Promise<{ workflowCount: number }>`
- `getPeriodUsage(tenantId): Promise<{ executionCount: number, executionMinutes: number }>`

**Default plan limits:**
| Plan | maxWorkflows | maxExecutionsPerMonth | maxExecutionMinutesPerMonth | maxCredentials |
|------|-------------|-----------------------|-----------------------------|----------------|
| free | 5 | 100 | 60 | 3 |
| pro | 50 | 5,000 | 1,000 | 50 |
| enterprise | -1 | -1 | -1 | -1 |

**Implementation notes:**
- If `limit === -1`, always returns `{ allowed: true }` (unlimited)
- If the plan is unknown, falls back to `free` plan limits
- `getUsagePercentage` returns 0 for unlimited dimensions
- `canCreateWorkflow` denies when `workflowCount >= maxWorkflows`
- `canExecuteWorkflow` denies when either `executionCount >= maxExecutionsPerMonth` OR `executionMinutes >= maxExecutionMinutesPerMonth`
- Tests use a mock usage tracker with `vi.fn()` -- no database required

**Acceptance Criteria:**
- `canCreateWorkflow` allows creation when under limit, denies at or over limit
- `canExecuteWorkflow` allows execution when under both count and minutes limits
- `canExecuteWorkflow` denies when either execution count or minutes limit is reached
- Enterprise plan always allowed (unlimited)
- `getUsagePercentage` returns correct percentages: 3/5 = 60%, 80/100 = 80%, etc.
- Unknown plan falls back to `free` limits
- `pnpm --filter @r360/api test -- --grep "PlanLimits"` passes
- TypeScript compiles with no errors

---

### Task 6: Stripe Webhook Handler

**Description:** Create a Stripe webhook handler that processes subscription lifecycle events: checkout completion, subscription updates, subscription cancellations, and payment failures. Also create a Fastify route plugin that verifies Stripe webhook signatures and delegates to the handler.

**Size:** Medium | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/billing/stripe-webhook-handler.ts`
- `packages/api/src/routes/billing-routes.ts`
- `packages/api/src/__tests__/billing/stripe-webhook.test.ts`

**StripeWebhookHandler class:**
- `constructor(tenantService: TenantServiceInterface, usageTracker: UsageTrackerInterface)`
- `handleEvent(event: StripeEvent)` -- dispatches to the appropriate handler based on event type
- Event handlers:
  - `checkout.session.completed` -- extracts `tenantId` from `session.metadata.tenantId` and `customerId` from `session.customer`; calls `tenantService.setStripeCustomerId(tenantId, customerId)`
  - `customer.subscription.updated` -- looks up tenant via `tenantService.getByStripeCustomerId(customerId)`; resolves plan from `subscription.items.data[0].price.lookup_key` or falls back to `PRICE_TO_PLAN` mapping; calls `tenantService.updatePlan(tenantId, plan)` when subscription is `active`
  - `customer.subscription.deleted` -- downgrades tenant to `free` plan via `tenantService.updatePlan(tenantId, 'free')`
  - `invoice.payment_failed` -- after `attempt_count >= 3`, downgrades to `free` plan
  - `invoice.paid` -- resets period usage counters via `usageTracker.resetPeriodUsage(tenantId)`
  - Unknown events -- logged via `console.log` and ignored (no error thrown)

**Interfaces:**
- `TenantServiceInterface` -- `{ updatePlan(tenantId, plan), deactivate(tenantId), setStripeCustomerId(tenantId, customerId), getByStripeCustomerId(customerId) }`
- `UsageTrackerInterface` -- `{ resetPeriodUsage(tenantId) }`
- `StripeEvent` -- `{ type: string, data: { object: Record<string, any> } }`

**PRICE_TO_PLAN mapping:**
- Uses env vars `STRIPE_PRICE_ID_FREE`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_ENTERPRISE` with test defaults

**billing-routes.ts (Fastify plugin):**
- `POST /api/billing/webhook` -- verifies Stripe signature using `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`, then delegates to `StripeWebhookHandler.handleEvent()`
- Raw body required for signature verification -- use Fastify's `addContentTypeParser` to capture raw body for this route
- Returns `{ received: true }` on success, 400 on invalid signature, 500 on handler error
- Webhook route must be registered BEFORE the auth middleware hook (no JWT required)

**Implementation notes:**
- Tests use mocked `TenantServiceInterface` and `UsageTrackerInterface` -- no real Stripe connection
- The billing routes plugin accepts pre-constructed handler and Stripe instance as constructor parameters

**Acceptance Criteria:**
- `checkout.session.completed` links customer to tenant
- `customer.subscription.updated` updates tenant plan based on price lookup
- `customer.subscription.deleted` downgrades to free
- `invoice.payment_failed` with `attempt_count >= 3` downgrades to free
- `invoice.paid` resets period usage
- Unknown event types handled gracefully (no error thrown)
- Billing routes plugin registers at `POST /api/billing/webhook`
- `pnpm --filter @r360/api test -- --grep "StripeWebhook"` passes
- TypeScript compiles with no errors

---

### Task 7: Tenant Provisioning Service

**Description:** Create a tenant provisioning service for creating tenants, managing tenant lifecycle (get, update plan, deactivate), and linking to Stripe customers. Create admin API routes protected by API key authentication for platform operators.

**Size:** Medium | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/services/tenant-service.ts`
- `packages/api/src/routes/admin-routes.ts`
- `packages/api/src/__tests__/services/tenant-service.test.ts`

**TenantService class:**
- `constructor(db: TenantDb)`
- `createTenant(input: CreateTenantInput)` -- creates tenant with default `free` plan, generates per-tenant encryption key salt (`crypto.randomBytes(32).toString('hex')`) and webhook signing secret (`whsec_${crypto.randomBytes(24).toString('hex')}`)
- `getTenant(tenantId)` -- returns tenant by ID or null
- `updatePlan(tenantId, plan)` -- updates the tenant's subscription plan
- `deactivate(tenantId)` -- marks tenant as inactive (sets `isActive: false`)
- `setStripeCustomerId(tenantId, customerId)` -- links Stripe customer to tenant
- `getByStripeCustomerId(customerId)` -- looks up tenant by Stripe customer ID, returns `{ id, plan }` or null

**Key types:**
- `CreateTenantInput` -- `{ name: string, slug: string, plan?: string }`
- `TenantDb` interface -- `{ create(data), getById(id), getBySlug(slug), getByStripeCustomerId(customerId), update(id, data), list(params), count() }`

**admin-routes.ts (Fastify plugin):**
- All routes require `x-admin-api-key` header matching `process.env.ADMIN_API_KEY`
- Admin auth enforced via Fastify `onRequest` hook on the plugin scope
- Routes:
  - `POST /api/admin/tenants` -- create a new tenant (body: `{ name, slug, plan? }`)
  - `GET /api/admin/tenants` -- list tenants with pagination (`?page=1&pageSize=20`)
  - `GET /api/admin/tenants/:id` -- get tenant detail
  - `PUT /api/admin/tenants/:id/plan` -- update tenant plan (body: `{ plan }`)
  - `POST /api/admin/tenants/:id/deactivate` -- deactivate tenant

**Implementation notes:**
- Slug uniqueness checked via `db.getBySlug()` before creation; throws if slug taken
- Default plan is `free` when not specified
- Tests use a mock `TenantDb` with `vi.fn()` -- no real database required
- Admin API key auth uses a simple header comparison (constant-time not critical here since API keys rotate)

**Acceptance Criteria:**
- `createTenant` generates encryption key salt and webhook signing secret
- `createTenant` rejects duplicate slugs with descriptive error
- `createTenant` defaults to `free` plan when not specified
- `getTenant` returns tenant by ID or null
- `updatePlan` updates the plan field
- `deactivate` marks tenant as inactive
- `setStripeCustomerId` / `getByStripeCustomerId` work correctly
- Admin routes reject requests without valid API key (403)
- Admin routes accept requests with valid API key
- `pnpm --filter @r360/api test -- --grep "TenantService"` passes
- TypeScript compiles with no errors

---

### Task 8: Security Middleware

**Description:** Create security middleware for the Fastify server: input sanitization to prevent XSS, request body size limiting, and CSRF protection for state-changing requests. Note: security headers and CORS are already handled by `@fastify/helmet` and `@fastify/cors` (registered in server.ts). Rate limiting is already handled by `@fastify/rate-limit`.

**Size:** Medium | **Dependencies:** Task 1

**Files to create:**
- `packages/api/src/middleware/security.ts`
- `packages/api/src/__tests__/middleware/security.test.ts`

**Exports:**
- `sanitizeInput(input: unknown): unknown` -- recursively strips HTML tags from string values in objects/arrays. Handles strings, arrays, nested objects. Preserves non-string values (numbers, booleans, null).
- `inputSanitizationHook` -- Fastify `onRequest` hook that sanitizes `request.body` on POST/PUT/PATCH requests
- `csrfProtectionHook` -- Fastify `onRequest` hook that validates `Origin` header against allowed origins or checks for `x-csrf-token` header on state-changing requests (POST, PUT, PATCH, DELETE). Exempt paths: `/webhook/*`, `/api/billing/webhook`.
- `requestSizeLimitPlugin` -- Fastify plugin that sets `bodyLimit` on the server (default: 1MB, configurable via `REQUEST_MAX_BODY_SIZE` env var)

**Sanitization rules:**
- Strip `<script>...</script>` tags and their contents
- Strip all HTML tags (e.g., `<img>`, `<div>`, `<a>`)
- Strip event handler attributes if present in tag-like strings (`onerror=`, `onload=`, `onclick=`)
- Use a simple regex approach: `/<[^>]*>/g` for HTML tags, `/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi` for script blocks

**Implementation notes:**
- `sanitizeInput` is recursive: for objects it sanitizes each value, for arrays it sanitizes each element
- CSRF protection checks that `Origin` header matches allowed origins (from `CORS_ALLOWED_ORIGINS` env) OR that `x-csrf-token` header is present (token validation is a future enhancement)
- Webhook routes and billing webhook route are exempt from CSRF protection
- Body size limiting uses Fastify's built-in `bodyLimit` option
- Tests are pure unit tests -- test `sanitizeInput` directly, mock Fastify request/reply objects for hook tests

**Acceptance Criteria:**
- `sanitizeInput('<script>alert("xss")</script>')` returns empty string or safe text
- `sanitizeInput` strips `<img onerror="...">` tags
- `sanitizeInput({ name: '<b>bold</b>', count: 42 })` returns `{ name: 'bold', count: 42 }`
- `sanitizeInput` handles nested objects and arrays recursively
- Input sanitization hook applies to POST/PUT/PATCH request bodies
- CSRF protection rejects state-changing requests without valid Origin or CSRF token
- CSRF protection allows requests with valid Origin header
- CSRF protection exempts webhook paths
- Request size limiting rejects oversized payloads
- `pnpm --filter @r360/api test -- --grep "Security Middleware"` passes
- TypeScript compiles with no errors

---

### Task 9: Security Test Suite

**Description:** Create a comprehensive OWASP-aligned security test suite that validates protection against common attack vectors: SQL injection, XSS, IDOR (insecure direct object reference), rate limiting enforcement, and auth bypass. All tests use mock/unit testing approach -- no real server or database required.

**Size:** Medium | **Dependencies:** Tasks 7, 8

**Files to create:**
- `packages/api/src/__tests__/security/owasp-tests.ts`

**Test categories:**

1. **SQL Injection Prevention:**
   - Verify that query-building functions use parameterized queries (not string concatenation)
   - Test that SQL injection payloads in workflow names (`'; DROP TABLE workflows; --`), search queries, and tenant IDs are treated as literal string values
   - Verify that Drizzle ORM's `.where()` calls use `eq()` comparisons (parameterized)
   - Test that direct SQL template strings use parameterized `$1, $2` placeholders

2. **XSS Prevention:**
   - Verify that `sanitizeInput` strips `<script>alert("xss")</script>` from workflow names
   - Verify that `<img onerror="alert('xss')">` patterns are stripped
   - Verify that event handler attributes (`onload`, `onerror`, `onclick`) are removed
   - Verify that sanitized output is safe for HTML rendering

3. **IDOR Prevention:**
   - Verify that resource access functions always require both `resourceId` AND `tenantId`
   - Verify that a mock tenant-A context cannot retrieve tenant-B resources (returns null)
   - Verify that update and delete operations include tenant scoping

4. **Rate Limiting Enforcement:**
   - Verify that the rate limit configuration is present and correctly configured (max 100 requests per minute)
   - Verify rate limit config includes `Retry-After` header support

5. **Auth Bypass Prevention:**
   - Verify that the auth middleware rejects requests without `Authorization` header
   - Verify that requests with malformed JWT tokens are rejected
   - Verify that the auth middleware extracts `tenantId` from token (not from query params or body)

**Implementation notes:**
- All tests use mocked dependencies -- no real HTTP server, database, or Redis
- Tests validate the security functions and middleware in isolation
- Import and test `sanitizeInput`, `csrfProtectionHook` directly
- Use `vi.fn()` mocks for database queries to verify that tenant scoping is enforced

**Acceptance Criteria:**
- SQL injection payloads treated as literal strings, not executed as SQL
- XSS payloads stripped from all user-input string fields
- IDOR tests confirm that cross-tenant resource access returns null/empty
- Rate limit configuration validated
- Auth bypass scenarios properly handled by middleware
- `pnpm --filter @r360/api test -- --grep "OWASP"` passes
- TypeScript compiles with no errors

---

### Task 10: Wire Up & Export

**Description:** Integrate all Phase 5 components into the server: billing routes, admin routes, audit logger middleware, plan limits enforcer in execution and workflow creation paths. Update barrel exports.

**Size:** Medium | **Dependencies:** Tasks 2-9

**Files to modify:**
- `packages/api/src/server.ts` -- register billing routes, admin routes; wire audit logger into request lifecycle; wire security middleware; wire plan limits enforcer

**Wiring details:**

1. **Billing routes** -- register `billingRoutes` Fastify plugin BEFORE the auth middleware hook (webhook endpoint is public, uses Stripe signature verification, not JWT)
2. **Admin routes** -- register `adminRoutes` Fastify plugin; protected by `x-admin-api-key` header (separate from JWT auth); register AFTER auth hook but with its own auth mechanism
3. **Audit logger** -- instantiate `AuditLogger` with a stub/no-op `AuditStore` (in-memory for now); wire as Fastify `onResponse` hook to log data access patterns on authenticated API routes
4. **Security middleware** -- wire `inputSanitizationHook` into the request lifecycle for POST/PUT/PATCH routes; wire `csrfProtectionHook` for state-changing requests (with webhook exemptions)
5. **Plan limits** -- create `PlanLimitsEnforcer` instance with stub usage tracker; add TODO comments at workflow creation and execution paths showing where `canCreateWorkflow()` and `canExecuteWorkflow()` checks will be called

**Imports to add to server.ts:**
```typescript
// Phase 5: Audit
import { AuditLogger } from './audit/audit-logger.js';

// Phase 5: Billing
import { billingRoutes } from './routes/billing-routes.js';

// Phase 5: Admin
import { adminRoutes } from './routes/admin-routes.js';
import { TenantService } from './services/tenant-service.js';

// Phase 5: Security
import { inputSanitizationHook, csrfProtectionHook } from './middleware/security.js';
```

**Server lifecycle updates:**
- On startup: all existing Phase 4 services + new Phase 5 services initialized
- On shutdown: no new cleanup needed (audit logger and billing handler are stateless)

**Acceptance Criteria:**
- Billing webhook route accessible at `POST /api/billing/webhook` without JWT auth
- Admin routes accessible at `/api/admin/*` with valid API key
- Admin routes return 403 without valid API key
- Audit logger instantiated and available in request lifecycle
- Input sanitization hook active on incoming requests
- Existing Phase 1-4 route registrations unchanged
- `pnpm -r build` succeeds with no TypeScript errors
- Existing Phase 1-4 tests still pass

---

### Task 11: Final Validation

**Description:** Run comprehensive validation: Cardinal Rule check, TypeScript compilation, all unit tests, and fix any errors discovered.

**Size:** Small | **Dependencies:** Task 10

**Files to create:**
- `scripts/validate-phase5.sh` -- validation script

**Validation steps:**
```bash
# 1. Cardinal Rule check
bash scripts/check-cardinal-rule.sh

# 2. TypeScript compilation (all packages)
pnpm -r build

# 3. TypeScript strict check
pnpm -r typecheck

# 4. Unit tests
pnpm --filter @r360/execution-engine test
pnpm --filter @r360/api test
pnpm --filter @r360/json-translator test

# 5. Lint
pnpm -r lint
```

**Acceptance Criteria:**
- Cardinal Rule check passes: no imports from `n8n/` source paths, no n8n forks or patches
- `pnpm -r build` succeeds across all packages
- `pnpm -r typecheck` passes with zero errors
- All unit tests pass: audit logger, query audit, usage tracker, plan limits, stripe webhook handler, tenant service, security middleware, OWASP security tests
- `pnpm -r lint` passes with no errors
- No circular dependencies between packages
- All new files follow existing project conventions (ESM imports with `.js` extensions, Vitest test framework, Fastify not Express)
- All Phase 5 files exist at expected paths

---

## Environment Variables (Phase 5)

```bash
# Stripe Billing
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_ID_FREE=price_xxxxx
STRIPE_PRICE_ID_PRO=price_xxxxx
STRIPE_PRICE_ID_ENTERPRISE=price_xxxxx

# Usage Metering
USAGE_FLUSH_INTERVAL_MS=60000       # Flush usage counters every 60s
USAGE_RETENTION_DAYS=90             # Keep usage records for 90 days

# Security
ENCRYPTION_MASTER_KEY=hex_encoded_256bit_key
CORS_ALLOWED_ORIGINS=https://app.r360flow.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
REQUEST_MAX_BODY_SIZE=1048576       # 1MB

# Admin
ADMIN_API_KEY=admin_xxxxx
```

## Critical Warnings

1. **Fastify, not Express:** The API server uses Fastify (not Express). All route plugins, middleware hooks, and request/reply handling must use Fastify APIs. The Phase 5 spec references Express in some code samples (`Router`, `req`, `res`, `next`) -- these MUST be translated to Fastify equivalents (`FastifyPluginAsync`, `request`, `reply`, `onRequest` hooks). Never install Express packages.

2. **No argon2:** We skip `argon2` (complex native build dependency) and use Node.js built-in `crypto.scryptSync` for key derivation, which is already established in the codebase.

3. **No helmet/cors/express-rate-limit:** The Fastify equivalents (`@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`) are already installed and configured in `server.ts`. Do not install Express middleware packages.

4. **Stripe raw body:** Stripe webhook signature verification requires the raw request body. Fastify does not preserve raw body by default. Use `addContentTypeParser` or Fastify's `rawBody` option to capture it for the webhook route.

5. **ESM imports:** All file imports must use `.js` extension (e.g., `import { X } from './audit-logger.js'`) per the project's ESM configuration.

6. **Vitest for tests:** All tests use Vitest (`describe`, `it`, `expect`, `vi` from `vitest`), not Jest.

7. **Mock-first testing:** All Phase 5 tests should be unit tests using mocked dependencies. No real database, Redis, or Stripe connections needed. This keeps tests fast and deterministic.

8. **Audit store is abstract:** The `AuditStore` interface is defined in Phase 5, but the PostgreSQL implementation (`PostgresAuditStore`) is deferred. Use a no-op or in-memory store for wiring in `server.ts`.

9. **Drizzle ORM query audit:** The project uses Drizzle ORM for database queries. The query audit test (Task 3) should scan for both raw SQL strings and Drizzle `.where()` patterns. If only Drizzle queries are found, verify `eq(table.tenantId, ...)` patterns are present.

10. **Admin auth is NOT JWT:** Admin routes use a separate API key mechanism (`x-admin-api-key` header), not the JWT auth middleware used for tenant API routes. This allows platform operators to manage tenants without being a tenant themselves.

## Parallel Execution Opportunities

The following tasks can run in parallel after Task 1 completes:
- **Group A:** Task 2 (Audit Logger) -- independent
- **Group B:** Task 3 (Query Audit) -- independent
- **Group C:** Task 4 (Usage Tracker) -> Task 5 (Plan Limits) -- sequential dependency
- **Group D:** Task 6 (Stripe Webhook Handler) -- independent
- **Group E:** Task 7 (Tenant Service) -- independent
- **Group F:** Task 8 (Security Middleware) -- independent

Maximum parallelism: Groups A, B, C, D, E, F can all start in parallel after Task 1 (with Task 5 waiting on Task 4 within Group C).

Task 9 (Security Tests) requires Tasks 7 and 8.
Task 10 (Wire Up) requires Tasks 2-9.
Task 11 (Final Validation) requires Task 10.
