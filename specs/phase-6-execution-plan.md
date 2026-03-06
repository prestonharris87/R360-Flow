# Phase 6 Execution Plan: Polish & Launch

## Summary
Finalize R360 Flow for production: workflow templates, error handling, versioning, white-label theming, API documentation, health monitoring, load tests, and production readiness gate.

## Dependency Graph
```
Task 1 (templates) ──┐
Task 2 (errors)   ──┤
Task 3 (versioning)──┤
Task 4 (theming)  ──┤── Task 9 (wire up) ── Task 10 (final validation)
Task 5 (docs)     ──┤
Task 6 (health)   ──┤
Task 7 (monitoring)──┤
Task 8 (load tests)──┘
```

---

## Task 1: Workflow Templates Service
**Size:** Medium | **Deps:** None

Create `packages/api/src/services/template-service.ts`:
- `TemplateRecord` interface: id, name, description, category, workflowData (JSON), isGlobal, tenantId, version, tags, createdAt, updatedAt
- `TemplateStore` interface (mocked in tests)
- `TemplateService` class: `create()`, `get()`, `list()`, `listGlobal()`, `listByTenant()`, `update()`, `delete()`, `forkToWorkflow()`

Create `packages/api/src/routes/template-routes.ts` (Fastify plugin):
- `GET /api/templates` — list global + tenant templates
- `GET /api/templates/:id` — get template
- `POST /api/templates` — create template
- `PUT /api/templates/:id` — update template
- `DELETE /api/templates/:id` — delete template
- `POST /api/templates/:id/fork` — fork template to new workflow

Create `packages/api/src/__tests__/services/template-service.test.ts`
Create `packages/api/src/__tests__/routes/template-routes.test.ts`

**Acceptance Criteria:**
- Template CRUD operations work
- Global templates visible to all tenants
- Per-tenant templates isolated
- Fork creates a new workflow from template

---

## Task 2: Error Handling Service
**Size:** Medium | **Deps:** None

Create `packages/api/src/services/error-handler.ts`:
- `ExecutionError` interface: id, tenantId, executionId, workflowId, nodeId, nodeName, errorType, message, stack, timestamp, retryCount, maxRetries, resolved
- `ErrorClassification`: 'network' | 'auth' | 'timeout' | 'validation' | 'internal' | 'rate_limit'
- `ErrorStore` interface (mocked)
- `ErrorHandlerService` class: `recordError()`, `classifyError()`, `getRecoverySuggestion()`, `canRetry()`, `scheduleRetry()`, `resolveError()`, `getErrors()`, `getErrorsByWorkflow()`

Create `packages/api/src/__tests__/services/error-handler.test.ts`

**Acceptance Criteria:**
- Errors recorded with classification
- Recovery suggestions based on error type
- Retry logic respects maxRetries
- Errors queryable by tenant/workflow

---

## Task 3: Workflow Versioning Service
**Size:** Medium | **Deps:** None

Create `packages/api/src/services/version-service.ts`:
- `WorkflowVersion` interface: id, workflowId, tenantId, version, data (JSON), changelog, createdBy, createdAt, tag
- `VersionStore` interface (mocked)
- `VersionService` class: `createVersion()`, `getVersion()`, `listVersions()`, `rollback()`, `diff()`, `tagVersion()`, `getLatest()`
- Copy-on-write: each save creates a new version record

Create `packages/api/src/__tests__/services/version-service.test.ts`

**Acceptance Criteria:**
- Versions created on workflow save
- Version history retrievable
- Rollback restores previous version data
- Diff compares two version data objects
- Tags assignable to versions

---

## Task 4: White-Label Theming Service
**Size:** Small | **Deps:** None

Create `packages/api/src/services/theme-service.ts`:
- `ThemeConfig` interface: tenantId, logoUrl, primaryColor, secondaryColor, accentColor, fontFamily, appName, faviconUrl
- `ThemeStore` interface (mocked)
- `ThemeService` class: `getTheme()`, `updateTheme()`, `resetToDefault()`

Create `packages/api/src/routes/theme-routes.ts` (Fastify plugin):
- `GET /api/theme` — get tenant theme
- `PUT /api/theme` — update tenant theme
- `DELETE /api/theme` — reset to default

Create `packages/api/src/__tests__/services/theme-service.test.ts`

**Acceptance Criteria:**
- Theme CRUD per tenant
- Default theme returned when none configured
- Theme isolated per tenant

---

## Task 5: API Documentation (OpenAPI)
**Size:** Small | **Deps:** None

Create `packages/api/src/docs/openapi-spec.ts`:
- Generate OpenAPI 3.0 spec object covering all API routes
- Route groups: workflows, executions, credentials, templates, admin, billing, theme
- Include request/response schemas, auth requirements, error responses

Create `packages/api/src/routes/docs-routes.ts` (Fastify plugin):
- `GET /api/docs` — serve OpenAPI JSON spec
- `GET /api/docs/ui` — serve simple HTML page that loads Swagger UI from CDN

Create `packages/api/src/__tests__/routes/docs-routes.test.ts`

**Acceptance Criteria:**
- OpenAPI spec accessible at /api/docs
- Spec includes all route groups
- Valid OpenAPI 3.0 structure

---

## Task 6: Health Check & Metrics
**Size:** Small | **Deps:** None

Create `packages/api/src/services/health-service.ts`:
- `HealthStatus`: 'healthy' | 'degraded' | 'unhealthy'
- `ComponentHealth` interface: name, status, latencyMs, details
- `HealthService` class: `check()`, `checkComponent()`, `getMetrics()`
- Components: api, database (mock), redis (mock), queue

Create `packages/api/src/routes/health-routes.ts` (Fastify plugin):
- `GET /api/health` — overall health (no auth required)
- `GET /api/health/ready` — readiness probe
- `GET /api/health/live` — liveness probe
- `GET /api/metrics` — basic metrics (JSON)

Create `packages/api/src/__tests__/services/health-service.test.ts`

**Acceptance Criteria:**
- Health endpoint returns component status
- Degraded status when components unhealthy
- Metrics endpoint returns counters

---

## Task 7: Monitoring & Alerting
**Size:** Small | **Deps:** None

Create `packages/api/src/services/monitoring-service.ts`:
- `AlertRule` interface: id, name, metric, threshold, comparison, severity, enabled
- `MetricPoint` interface: name, value, timestamp, tags
- `MonitoringService` class: `recordMetric()`, `evaluateAlerts()`, `getAlertRules()`, `addAlertRule()`, `removeAlertRule()`, `getMetricHistory()`
- Built-in metrics: http_request_duration, execution_duration, queue_depth, error_rate

Create `packages/api/src/__tests__/services/monitoring-service.test.ts`

**Acceptance Criteria:**
- Metrics recordable and queryable
- Alert rules evaluate against thresholds
- Alert severity levels (info, warning, critical)

---

## Task 8: Load Test Suite
**Size:** Medium | **Deps:** None

Create `packages/api/src/__tests__/load/multi-tenant-load.test.ts`:
- Multi-tenant CRUD stress test (create 50 tenants, concurrent operations)
- Verify tenant isolation under concurrent access
- Measure operation latency (p50, p95, p99)
- All in-memory / mock — no real DB or Redis needed

Create `packages/api/src/__tests__/load/execution-load.test.ts`:
- Concurrent execution simulation
- Queue throughput verification
- Per-tenant rate limiting under load

**Acceptance Criteria:**
- 50+ simulated tenants
- Concurrent operations complete without cross-tenant leakage
- Latency metrics calculated

---

## Task 9: Wire Up & Export
**Size:** Medium | **Deps:** Tasks 1-8

- Wire template routes into `server.ts`
- Wire theme routes into `server.ts`
- Wire docs routes into `server.ts` (no auth required)
- Wire health routes into `server.ts` (no auth required)
- Create ErrorHandlerService instance
- Create VersionService instance
- Create MonitoringService instance
- Export new services from package

**Acceptance Criteria:**
- Template, theme, docs, health routes accessible
- Typecheck passes
- All existing tests still pass

---

## Task 10: Final Validation (Production Readiness)
**Size:** Medium | **Deps:** Task 9

- Run cardinal rule check
- Run typecheck on all packages
- Run ALL tests on all packages
- Verify all Phase 6 files exist
- Verify total test count across all phases
- Run production readiness checklist:
  - All 6 phases verified
  - No n8n source imports
  - All routes documented in OpenAPI spec
  - Health endpoints functional
  - Security test suite passing

**Acceptance Criteria:**
- All tests pass
- All typechecks pass
- Cardinal Rule: PASSED
- All Phase 6 files exist
- Production readiness gate: PASSED

---

## Critical Warnings
1. **No external service deps in tests** — all DB, Redis, Stripe, Sentry mocked
2. **Drizzle ORM patterns** — scan for `.where()` patterns, not raw SQL
3. **No native deps** — use Node.js built-in crypto, not argon2
4. **Cardinal Rule** — tenant isolation is OUR code, never n8n's
5. **Load tests are unit tests** — simulate concurrency with Promise.all, not real HTTP load
6. **OpenAPI spec is static** — generate a spec object, don't auto-generate from routes
