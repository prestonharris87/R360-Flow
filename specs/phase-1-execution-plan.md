# Phase 1 Execution Plan: Foundation -- API Server + Database

## Summary

Phase 1 builds the multi-tenant foundation for R360 Flow. It delivers a pnpm monorepo with three packages (`@r360/types`, `@r360/db`, `@r360/api`), a Docker Compose stack (PostgreSQL 16 + Redis 7), 7 Drizzle ORM tables all with `tenant_id`, JWT auth with RBAC middleware, Workflow CRUD, Credential CRUD with per-tenant AES-256-GCM encryption, Execution History API (stub), and an integration test suite verifying tenant isolation.

**Cardinal Rule:** Phase 1 has ZERO n8n dependency. No n8n packages are installed.

## Task Dependency Graph

```
Task 1 (Root Monorepo Config) ─────────┬──────────────────────────────────────────┐
                                        │                                          │
Task 3 (Docker Compose) ──────┐         │                                          │
                               │        ▼                                          │
                               │   Task 2 (Shared Types @r360/types)               │
                               │        │                                          │
                               │        ▼                                          │
                               └──> Task 4 (DB Package @r360/db)                   │
                                        │                                          │
                                        ▼                                          ▼
                                   Task 5 (API Package Scaffold) ◄─────────────────┘
                                        │
                                        ▼
                                   Task 6 (Auth & Tenant Middleware)
                                        │
                               ┌────────┼────────┐
                               ▼        ▼        ▼
                          Task 7    Task 8    Task 9
                       (Workflows) (Creds)  (Executions)
                               │        │        │
                               └────────┼────────┘
                                        ▼
                                   Task 10 (Server Wiring)
                                        │
                                        ▼
                                   Task 11 (Integration Tests)
                                        │
                                        ▼
                                   Task 12 (Final Validation)
```

## Tasks

### Task 1: Root Monorepo Configuration

**Description:** Initialize the pnpm workspace root with `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, ESLint config, Prettier config, Vitest workspace config, and update `.gitignore`.

**Files to create:**
- `package.json` (root)
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `eslint.config.mjs`
- `vitest.workspace.ts`

**Files to modify:**
- `.gitignore`

**Dependencies:** None
**Size:** Medium

**Acceptance Criteria:**
- `pnpm install` succeeds from repo root
- `pnpm-workspace.yaml` declares `packages/*` and `workflowbuilder`
- `tsconfig.base.json` has strict mode, ES2022 target, Node16 module resolution
- `.gitignore` excludes `node_modules/`, `dist/`, `.env`, `drizzle/`, `*.tsbuildinfo`

---

### Task 2: Shared Types Package (`@r360/types`)

**Description:** Create `packages/types` with branded ID types, enum constants, API response interfaces, and Zod validation schemas.

**Files to create:**
- `packages/types/package.json`
- `packages/types/tsconfig.json`
- `packages/types/vitest.config.ts`
- `packages/types/src/index.ts`
- `packages/types/src/validators.ts`
- `packages/types/src/__tests__/types.test.ts`
- `packages/types/src/__tests__/validators.test.ts`

**Dependencies:** Task 1
**Size:** Medium

**Acceptance Criteria:**
- `TenantId` branded type exported
- All enum values match DB schema enums
- Zod schemas validate correctly
- `pnpm --filter @r360/types build` succeeds
- `pnpm --filter @r360/types test` passes

---

### Task 3: Docker Compose Infrastructure

**Description:** Docker Compose stack with PostgreSQL 16 and Redis 7, health checks, volumes, and init scripts.

**Files to create:**
- `infrastructure/docker-compose.yml`
- `infrastructure/init-scripts/01-extensions.sql`
- `scripts/dev-up.sh`

**Dependencies:** None (parallel with Task 1)
**Size:** Small

**Acceptance Criteria:**
- `docker compose -f infrastructure/docker-compose.yml up -d` starts both containers
- PostgreSQL on port 5432, Redis on port 6379
- `uuid-ossp` and `pgcrypto` extensions installed

---

### Task 4: Database Package (`@r360/db`)

**Description:** 7 Drizzle ORM tables (tenants, users, workflows, credentials, executions, execution_steps, webhooks), connection management, migration generation.

**Files to create:**
- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/vitest.config.ts`
- `packages/db/vitest.integration.config.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/src/schema/tenants.ts`
- `packages/db/src/schema/users.ts`
- `packages/db/src/schema/workflows.ts`
- `packages/db/src/schema/credentials.ts`
- `packages/db/src/schema/executions.ts`
- `packages/db/src/schema/execution-steps.ts`
- `packages/db/src/schema/webhooks.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/connection.ts`
- `packages/db/src/index.ts`
- `packages/db/src/__tests__/schema.test.ts`
- `packages/db/src/__tests__/connection.test.ts`

**Dependencies:** Task 1, Task 2
**Size:** Large

**Acceptance Criteria:**
- All 7 tables with proper columns, indexes, FKs
- Every tenant-scoped table has `tenantId` FK to tenants
- `pnpm --filter @r360/db build` succeeds
- Schema unit tests pass
- Migrations generate cleanly

---

### Task 5: API Package Scaffolding & Server Bootstrap

**Description:** Fastify server setup with CORS, Helmet, rate limiting, Pino logging, health endpoint, test helpers.

**Files to create:**
- `packages/api/package.json`
- `packages/api/tsconfig.json`
- `packages/api/vitest.config.ts`
- `packages/api/vitest.integration.config.ts`
- `packages/api/.env.example`
- `packages/api/src/server.ts`
- `packages/api/src/routes/health.ts`
- `packages/api/src/__tests__/setup.ts`
- `packages/api/src/__tests__/helpers/test-server.ts`
- `packages/api/src/__tests__/helpers/test-auth.ts`

**Dependencies:** Task 1, Task 2, Task 4
**Size:** Medium

**Acceptance Criteria:**
- `GET /health` returns 200 with status
- CORS and security headers present
- Test server factory works for `inject()` testing

---

### Task 6: Auth & Tenant Middleware

**Description:** JWT auth middleware with RBAC. Extracts tenant context, enforces role hierarchy.

**Files to create:**
- `packages/api/src/middleware/auth.ts`
- `packages/api/src/__tests__/middleware/auth.test.ts`

**Dependencies:** Task 5
**Size:** Medium

**Acceptance Criteria:**
- 401 for missing/invalid/expired tokens
- `request.tenantContext` populated with tenantId, userId, role
- `requireRole()` enforces role hierarchy
- `/health` accessible without auth

---

### Task 7: Workflow CRUD API

**Description:** Tenant-scoped workflow CRUD: create, list (paginated), get, update, soft-delete.

**Files to create:**
- `packages/api/src/routes/workflows.ts`
- `packages/api/src/__tests__/routes/workflows.test.ts`

**Dependencies:** Task 4, Task 5, Task 6
**Size:** Large

**Acceptance Criteria:**
- All CRUD operations tenant-scoped
- Pagination with metadata
- Cross-tenant access returns 404
- Soft delete sets status to archived

---

### Task 8: Credential CRUD API with Per-Tenant Encryption

**Description:** AES-256-GCM encryption with per-tenant key derivation. Credential CRUD with encrypted storage.

**Files to create:**
- `packages/api/src/services/encryption.ts`
- `packages/api/src/routes/credentials.ts`
- `packages/api/src/__tests__/routes/credentials.test.ts`
- `packages/api/src/__tests__/integration/encryption.test.ts`

**Dependencies:** Task 4, Task 5, Task 6
**Size:** Large

**Acceptance Criteria:**
- Per-tenant AES-256-GCM encryption
- Encrypted data never in API responses
- Cross-tenant access returns 404
- Encryption roundtrip works

---

### Task 9: Execution History API

**Description:** Stub execution trigger and history endpoints.

**Files to create:**
- `packages/api/src/routes/executions.ts`
- `packages/api/src/__tests__/routes/executions.test.ts`

**Dependencies:** Task 4, Task 5, Task 6, Task 7
**Size:** Medium

**Acceptance Criteria:**
- Trigger creates pending execution (202)
- List with pagination and filtering
- Detail includes steps array
- Cross-tenant access returns 404

---

### Task 10: Server Wiring & Route Registration

**Description:** Wire all routes and middleware into Fastify server entry point.

**Files to modify:**
- `packages/api/src/server.ts`

**Dependencies:** Task 5, Task 6, Task 7, Task 8, Task 9
**Size:** Small

**Acceptance Criteria:**
- All routes respond correctly
- Auth applied to `/api/*` only
- Graceful shutdown

---

### Task 11: Integration Test Suite

**Description:** Comprehensive tenant isolation and API integration tests against real PostgreSQL.

**Files to create:**
- `packages/api/src/__tests__/integration/tenant-isolation.test.ts`
- `packages/api/src/__tests__/integration/api-health.test.ts`

**Dependencies:** Task 7, Task 8, Task 9, Task 10
**Size:** Medium

**Acceptance Criteria:**
- 7 tenant isolation tests pass
- Health check integration test passes
- `pnpm --filter @r360/api test:integration` passes

---

### Task 12: Final Validation & CI Readiness

**Description:** Full validation: build, typecheck, lint, tests, Cardinal Rule check.

**Files to create:**
- `scripts/validate-phase1.sh`

**Dependencies:** All previous tasks
**Size:** Small

**Acceptance Criteria:**
- `pnpm -r build` succeeds
- `pnpm -r typecheck` passes
- Zero n8n dependencies in any package.json
- All tests pass

---

## Risk Areas

| Risk | Mitigation |
|------|------------|
| Drizzle ORM pgEnum compatibility | Pin versions, test migration early |
| Fastify v5 plugin compatibility | Verify plugin versions, fallback to v4 |
| pnpm workspace + TS project references | Use `workspace:*`, correct tsconfig references |
| Integration test DB state interference | Serial execution, unique tenant IDs per suite |
| scryptSync latency | Accept for Phase 1, optimize later |

## File Manifest

**Total: 55 files to create, 1 to modify (.gitignore)**
