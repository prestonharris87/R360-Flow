# Phase 5 Execution Plan: Multi-Tenant Hardening

## Summary
Harden R360 Flow for production multi-tenancy: audit logging, billing integration (Stripe), tenant provisioning, security middleware, and comprehensive security tests.

## Dependency Graph
```
Task 1 (deps) ──┬── Task 2 (audit logger)
                ├── Task 3 (query audit)
                ├── Task 4 (usage tracker) ── Task 5 (plan limits)
                ├── Task 6 (stripe webhook)
                ├── Task 7 (tenant service)
                ├── Task 8 (security middleware)
                └── Task 9 (security tests) [blocked by 7, 8]
                    └── Task 10 (wire up) [blocked by 2-9]
                        └── Task 11 (final validation)
```

---

## Task 1: Install Phase 5 Dependencies
**Size:** Small | **Deps:** None

Install `stripe` to `@r360/api`.

**Files:** `packages/api/package.json`, `pnpm-lock.yaml`

**Acceptance Criteria:**
- `stripe` importable from `@r360/api`
- `pnpm install` succeeds

---

## Task 2: Audit Logger
**Size:** Small | **Deps:** Task 1

Create `packages/api/src/audit/audit-logger.ts`:
- `AuditEvent`, `SecurityEvent`, `AuditQuery`, `AuditStore` interfaces
- `AuditLogger` class: `log()`, `logSecurityEvent()`, `query()`
- Security events logged to stderr for alerting

Create `packages/api/src/__tests__/isolation/audit-log.test.ts`

**Acceptance Criteria:**
- Data access events recorded via store
- Cross-tenant access attempts recorded with `blocked` flag
- Audit logs queryable by tenant and date range

---

## Task 3: Query Audit Test
**Size:** Small | **Deps:** Task 1

Create `packages/api/src/__tests__/isolation/query-audit.test.ts`:
- Static analysis scanning `packages/db/src/` for SQL queries
- Verify all SELECT/UPDATE/DELETE on tenant-scoped tables include `tenant_id`
- Exempt tables: `tenants`, `migrations`

Note: Uses Drizzle ORM — look for `.where()` calls with `eq(table.tenantId, ...)` patterns rather than raw SQL strings. May need adaptation to scan for drizzle query patterns.

**Acceptance Criteria:**
- All tenant-scoped queries verified to include tenant_id filtering

---

## Task 4: Usage Tracker
**Size:** Small | **Deps:** Task 1

Create `packages/api/src/billing/usage-tracker.ts`:
- `UsageTracker` class: `trackWorkflowCreated()`, `trackWorkflowDeleted()`, `trackExecution()`, `getCurrentUsage()`, `getPeriodUsage()`
- `UsageStore` interface (mocked in tests)

Create `packages/api/src/__tests__/billing/usage-tracker.test.ts`

**Acceptance Criteria:**
- Workflow creation/deletion tracked
- Execution duration tracked in minutes
- Current and period usage retrievable

---

## Task 5: Plan Limits Enforcer
**Size:** Small | **Deps:** Task 4

Create `packages/api/src/billing/plan-limits.ts`:
- `PlanLimitsEnforcer`: `canCreateWorkflow()`, `canExecuteWorkflow()`, `getUsagePercentage()`
- Plan limits: free (5 workflows, 100 executions/mo), pro (50/5000), enterprise (unlimited)

Create `packages/api/src/__tests__/billing/plan-limits.test.ts`

**Acceptance Criteria:**
- Free plan: blocked at 5 workflows, 100 executions/month
- Enterprise plan: unlimited
- Usage percentages calculated correctly

---

## Task 6: Stripe Webhook Handler
**Size:** Medium | **Deps:** Task 1

Create `packages/api/src/billing/stripe-webhook-handler.ts`:
- Handle: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- `TenantServiceInterface` and `UsageTrackerInterface` for dependency injection

Create `packages/api/src/routes/billing-routes.ts` (Fastify plugin):
- `POST /api/billing/webhook` with Stripe signature verification

Create `packages/api/src/__tests__/billing/stripe-webhook.test.ts`

**Acceptance Criteria:**
- Checkout completion sets Stripe customer ID
- Subscription update changes tenant plan
- Subscription deletion downgrades to free
- Payment failure after 3 attempts downgrades
- Unknown events ignored gracefully

---

## Task 7: Tenant Provisioning Service
**Size:** Medium | **Deps:** Task 1

Create `packages/api/src/services/tenant-service.ts`:
- `TenantService`: `createTenant()`, `getTenant()`, `updatePlan()`, `deactivate()`, `setStripeCustomerId()`, `getByStripeCustomerId()`
- Uses `TenantDb` interface for DB operations

Create `packages/api/src/routes/admin-routes.ts` (Fastify plugin):
- `POST /api/admin/tenants` — create tenant
- `GET /api/admin/tenants/:id` — get tenant
- `PUT /api/admin/tenants/:id/plan` — update plan
- `DELETE /api/admin/tenants/:id` — deactivate
- Admin API key authentication via `x-admin-api-key` header

Create tests for both

**Acceptance Criteria:**
- Tenant CRUD operations work
- Admin routes require valid API key
- Plan updates propagate correctly

---

## Task 8: Security Middleware
**Size:** Medium | **Deps:** Task 1

Create `packages/api/src/middleware/security.ts`:
- Input sanitization (strip HTML tags from string inputs)
- Request body size validation
- CSRF token check for state-changing requests (optional, can be simple origin check)
- Content-Type enforcement

Create `packages/api/src/__tests__/security/security-middleware.test.ts`

**Acceptance Criteria:**
- HTML tags stripped from inputs
- Oversized request bodies rejected
- Content-Type validated for POST/PUT

---

## Task 9: Security Test Suite
**Size:** Medium | **Deps:** Tasks 7, 8

Create `packages/api/src/__tests__/security/owasp-tests.ts`:
- SQL injection prevention (parameterized queries in Drizzle)
- XSS prevention (output encoding/sanitization)
- IDOR tests (tenant A can't access tenant B resources via ID guessing)
- Auth bypass tests (missing/invalid JWT rejected)
- Rate limiting verification

All use mock/unit approach — no real server needed.

**Acceptance Criteria:**
- SQL injection payloads handled safely
- XSS payloads sanitized
- IDOR prevented by tenant_id checks
- Auth middleware rejects invalid tokens

---

## Task 10: Wire Up & Export
**Size:** Medium | **Deps:** Tasks 2-9

- Wire billing routes into `server.ts`
- Wire admin routes into `server.ts` (behind admin auth)
- Wire security middleware as Fastify preHandler
- Wire audit logger calls into key API operations
- Wire plan limits checks into workflow creation and execution paths

**Acceptance Criteria:**
- Billing webhook endpoint accessible
- Admin endpoints behind API key auth
- Security middleware applied to all routes
- Typecheck passes

---

## Task 11: Final Validation
**Size:** Small | **Deps:** Task 10

- Run cardinal rule check
- Run typecheck on all packages
- Run tests on all packages
- Fix any errors

**Acceptance Criteria:**
- All tests pass
- All typechecks pass
- Cardinal Rule: PASSED
- All Phase 5 files exist

---

## Critical Warnings
1. **No Stripe API calls in tests** — all Stripe interactions mocked
2. **Drizzle ORM query audit** — scan for `.where()` patterns, not raw SQL
3. **No native deps** — avoid argon2, use Node.js built-in scrypt for hashing
4. **Cardinal Rule** — tenant isolation is OUR code, never n8n's
5. **Admin auth** — separate from JWT auth, uses API key header
