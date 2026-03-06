# Phase 1: Foundation -- API Server + Database

## Overview

- **Goal**: Build a standalone, tenant-aware API server with PostgreSQL persistence, Redis connectivity, auth middleware, and full CRUD for workflows, credentials, and execution history. This is the multi-tenant scaffolding that all future phases build upon.
- **Prerequisites**: None
- **Cardinal Rule Checkpoint**: Phase 1 has **zero n8n dependency**. No n8n packages are installed. We are building the wrapper layer that will surround n8n later.
- **Duration Estimate**: Weeks 1-3
- **Key Deliverables**:
  - pnpm monorepo with `packages/api`, `packages/types`, `packages/db`
  - Docker Compose stack (PostgreSQL 16 + Redis 7)
  - 7 Drizzle ORM tables, all with `tenant_id`
  - JWT auth + RBAC middleware
  - Workflow CRUD API (tenant-scoped, paginated, validated)
  - Credential CRUD API (per-tenant AES-256-GCM encryption)
  - Execution History API (stub execute, list, detail)
  - Integration test suite with full tenant isolation verification

---

## Environment Setup

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20.x LTS | Runtime |
| pnpm | >= 9.x | Monorepo package manager |
| Docker + Docker Compose | Latest | Local PostgreSQL + Redis |
| TypeScript | 5.5+ | Language |
| Vitest | Latest | Test runner |
| ESLint + Prettier | Latest | Linting and formatting |

### Environment Variables

Create `packages/api/.env` (gitignored):

```env
# Server
PORT=3100
NODE_ENV=development

# Database
DATABASE_URL=postgresql://r360:r360_dev_password@localhost:5432/r360flow
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=dev-secret-change-in-production-min-32-chars!!
JWT_ISSUER=r360-flow
JWT_AUDIENCE=r360-flow-api
JWT_EXPIRY=24h

# Encryption (for credential vault)
MASTER_ENCRYPTION_KEY=dev-master-key-change-in-production-256bit!!
```

### Verification

```bash
node --version    # >= 20.x
pnpm --version    # >= 9.x
docker compose version
```

---

## Step 1.1: Monorepo Scaffolding

### Objective

Initialize the pnpm workspace with three packages (`api`, `types`, `db`), shared TypeScript configuration, Vitest for testing, and ESLint for linting. The workspace must coexist alongside the existing `workflowbuilder/` directory.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/types/src/__tests__/types.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';

describe('Shared Types Package', () => {
  it('should export TenantId branded type', async () => {
    const { TenantId } = await import('../index.js');
    expect(TenantId).toBeDefined();
  });

  it('should export WorkflowStatus enum', async () => {
    const { WorkflowStatus } = await import('../index.js');
    expect(WorkflowStatus.Active).toBe('active');
    expect(WorkflowStatus.Inactive).toBe('inactive');
    expect(WorkflowStatus.Draft).toBe('draft');
  });
});
```

#### 2. Implement

**File: `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "workflowbuilder"
```

**File: `package.json` (root)**

```json
{
  "name": "r360-flow",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "test:unit": "pnpm -r --filter='./packages/*' test:unit",
    "test:integration": "pnpm -r --filter='./packages/*' test:integration",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "dev": "pnpm --filter @r360/api dev",
    "db:generate": "pnpm --filter @r360/db generate",
    "db:migrate": "pnpm --filter @r360/db migrate",
    "db:studio": "pnpm --filter @r360/db studio"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "prettier": "^3.3.0"
  }
}
```

**File: `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false
  }
}
```

**File: `packages/types/package.json`**

```json
{
  "name": "@r360/types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  }
}
```

**File: `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**File: `packages/db/package.json`**

```json
{
  "name": "@r360/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@r360/types": "workspace:*",
    "drizzle-orm": "^0.33.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.24.0"
  }
}
```

**File: `packages/api/package.json`**

```json
{
  "name": "@r360/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -b",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@r360/types": "workspace:*",
    "@r360/db": "workspace:*",
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/helmet": "^12.0.0",
    "@fastify/rate-limit": "^10.0.0",
    "jose": "^5.6.0",
    "zod": "^3.23.0",
    "ioredis": "^5.4.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "tsx": "^4.16.0"
  }
}
```

#### 3. Run tests

```bash
pnpm install
pnpm --filter @r360/types test
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| Module not found for `../index.js` | Create `packages/types/src/index.ts` with exports |
| `TenantId` not defined | Add branded type export |
| Vitest not configured | Add `vitest.config.ts` to each package |

#### 5. Refactor

- Extract shared Vitest config to root `vitest.workspace.ts`
- Ensure all packages resolve workspace dependencies

### Success Criteria

- [ ] `pnpm install` succeeds from repo root
- [ ] `pnpm -r build` compiles all three packages
- [ ] `pnpm -r test` passes
- [ ] `pnpm -r typecheck` passes
- [ ] Workspace packages resolve each other via `workspace:*`

### Verification Commands

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm -r typecheck
```

---

## Step 1.2: Infrastructure (Docker Compose)

### Objective

Set up Docker Compose with PostgreSQL 16 and Redis 7, including connection pooling, health checks, persistent volumes, and a convenience initialization script.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/db/src/__tests__/connection.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';

describe('Database Connection', () => {
  it('should connect to PostgreSQL and run a simple query', async () => {
    const { getDb } = await import('../connection.js');
    const db = getDb();
    const result = await db.execute('SELECT 1 as value');
    expect(result).toBeDefined();
  });

  it('should have required extensions installed', async () => {
    const { getDb } = await import('../connection.js');
    const db = getDb();
    // uuid-ossp for UUID generation
    const result = await db.execute(
      "SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'"
    );
    expect(result.length).toBe(1);
  });
});
```

#### 2. Implement

**File: `infrastructure/docker-compose.yml`**

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: r360-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: r360flow
      POSTGRES_USER: r360
      POSTGRES_PASSWORD: r360_dev_password
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"
    ports:
      - "5432:5432"
    volumes:
      - r360_pgdata:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U r360 -d r360flow"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s
    deploy:
      resources:
        limits:
          memory: 512M

  redis:
    image: redis:7-alpine
    container_name: r360-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - r360_redis:/data
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --save 60 1000
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 5s
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  r360_pgdata:
    driver: local
  r360_redis:
    driver: local
```

**File: `infrastructure/init-scripts/01-extensions.sql`**

```sql
-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create a read-only role for analytics queries (optional, future use)
-- DO $$ BEGIN
--   CREATE ROLE r360_readonly;
-- EXCEPTION WHEN duplicate_object THEN NULL;
-- END $$;
```

**File: `packages/db/src/connection.ts`**

```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

let sql: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export function getConnection() {
  if (!sql) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    sql = postgres(databaseUrl, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export function getDb() {
  if (!db) {
    db = drizzle(getConnection(), { schema });
  }
  return db;
}

export async function closeConnection() {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}
```

#### 3. Run tests

```bash
cd infrastructure && docker compose up -d
pnpm --filter @r360/db test:integration
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| Docker containers not healthy | Run `docker compose logs postgres` and check init scripts |
| Connection refused | Verify port 5432 is not already in use: `lsof -i :5432` |
| Extension not found | Verify `init-scripts/01-extensions.sql` is mounted correctly |

#### 5. Refactor

- Add a `scripts/dev-up.sh` convenience script that starts Docker and waits for health

### Success Criteria

- [ ] `docker compose up -d` starts both containers
- [ ] `docker compose ps` shows both services as healthy
- [ ] PostgreSQL accepts connections on port 5432
- [ ] Redis accepts connections on port 6379
- [ ] `uuid-ossp` and `pgcrypto` extensions are installed
- [ ] Connection pool works with configurable min/max

### Verification Commands

```bash
cd infrastructure && docker compose up -d && docker compose ps
docker exec r360-postgres pg_isready -U r360 -d r360flow
docker exec r360-redis redis-cli ping
```

---

## Step 1.3: DB Schema & Migrations (Drizzle ORM)

### Objective

Define 7 Drizzle ORM tables -- all with mandatory `tenant_id` -- with proper indexes, foreign keys, and migration generation. Every table enforces tenant scoping at the schema level.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/db/src/__tests__/schema.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  tenants,
  users,
  workflows,
  credentials,
  executions,
  executionSteps,
  webhooks,
} from '../schema/index.js';

describe('Schema Definition', () => {
  it('all tenant-scoped tables have tenant_id column', () => {
    const tenantScopedTables = [users, workflows, credentials, executions, webhooks];
    for (const table of tenantScopedTables) {
      expect(table.tenantId).toBeDefined();
    }
  });

  it('execution_steps has execution_id foreign key', () => {
    expect(executionSteps.executionId).toBeDefined();
  });

  it('tenants table has slug column with unique constraint', () => {
    expect(tenants.slug).toBeDefined();
  });

  it('workflows table has is_active boolean defaulting to false', () => {
    expect(workflows.isActive).toBeDefined();
  });
});
```

#### 2. Implement

**File: `packages/db/src/schema/tenants.ts`**

```typescript
import { pgTable, uuid, varchar, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'enterprise']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan: planEnum('plan').notNull().default('free'),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
```

**File: `packages/db/src/schema/users.ts`**

```typescript
import { pgTable, uuid, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member', 'viewer']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 255 }),
    role: userRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('users_tenant_id_idx').on(table.tenantId),
    externalIdx: index('users_external_id_idx').on(table.externalId),
    emailTenantIdx: index('users_email_tenant_idx').on(table.email, table.tenantId),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

**File: `packages/db/src/schema/workflows.ts`**

```typescript
import {
  pgTable, uuid, varchar, jsonb, boolean,
  timestamp, pgEnum, index, text,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const workflowStatusEnum = pgEnum('workflow_status', [
  'draft', 'active', 'inactive', 'archived',
]);

export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    definitionJson: jsonb('definition_json').notNull().default({}),
    status: workflowStatusEnum('status').notNull().default('draft'),
    isActive: boolean('is_active').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('workflows_tenant_id_idx').on(table.tenantId),
    tenantStatusIdx: index('workflows_tenant_status_idx').on(table.tenantId, table.status),
    tenantActiveIdx: index('workflows_tenant_active_idx').on(table.tenantId, table.isActive),
  })
);

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
```

**File: `packages/db/src/schema/credentials.ts`**

```typescript
import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 128 }).notNull(),
    encryptedData: text('encrypted_data').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('credentials_tenant_id_idx').on(table.tenantId),
    tenantTypeIdx: index('credentials_tenant_type_idx').on(table.tenantId, table.type),
  })
);

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
```

**File: `packages/db/src/schema/executions.ts`**

```typescript
import {
  pgTable, uuid, varchar, jsonb, text,
  timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { workflows } from './workflows.js';

export const executionStatusEnum = pgEnum('execution_status', [
  'pending', 'running', 'success', 'error', 'cancelled', 'timeout',
]);

export const executions = pgTable(
  'executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    status: executionStatusEnum('status').notNull().default('pending'),
    mode: varchar('mode', { length: 50 }).notNull().default('manual'),
    contextJson: jsonb('context_json').default({}),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('executions_tenant_id_idx').on(table.tenantId),
    workflowIdx: index('executions_workflow_id_idx').on(table.workflowId),
    tenantStatusIdx: index('executions_tenant_status_idx').on(table.tenantId, table.status),
    tenantCreatedIdx: index('executions_tenant_created_idx').on(table.tenantId, table.createdAt),
  })
);

export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
```

**File: `packages/db/src/schema/execution-steps.ts`**

```typescript
import {
  pgTable, uuid, varchar, jsonb,
  timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { executions } from './executions.js';

export const stepStatusEnum = pgEnum('step_status', [
  'pending', 'running', 'success', 'error', 'skipped',
]);

export const executionSteps = pgTable(
  'execution_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    nodeId: varchar('node_id', { length: 255 }).notNull(),
    nodeName: varchar('node_name', { length: 255 }),
    nodeType: varchar('node_type', { length: 255 }),
    status: stepStatusEnum('status').notNull().default('pending'),
    inputJson: jsonb('input_json'),
    outputJson: jsonb('output_json'),
    error: jsonb('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => ({
    executionIdx: index('execution_steps_execution_id_idx').on(table.executionId),
    nodeIdx: index('execution_steps_node_id_idx').on(table.executionId, table.nodeId),
  })
);

export type ExecutionStep = typeof executionSteps.$inferSelect;
export type NewExecutionStep = typeof executionSteps.$inferInsert;
```

**File: `packages/db/src/schema/webhooks.ts`**

```typescript
import {
  pgTable, uuid, varchar, boolean,
  timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { workflows } from './workflows.js';

export const httpMethodEnum = pgEnum('http_method', [
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
]);

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    path: varchar('path', { length: 512 }).notNull(),
    method: httpMethodEnum('method').notNull().default('POST'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('webhooks_tenant_id_idx').on(table.tenantId),
    pathIdx: index('webhooks_path_idx').on(table.tenantId, table.path),
    workflowIdx: index('webhooks_workflow_id_idx').on(table.workflowId),
  })
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
```

**File: `packages/db/src/schema/index.ts`**

```typescript
export * from './tenants.js';
export * from './users.js';
export * from './workflows.js';
export * from './credentials.js';
export * from './executions.js';
export * from './execution-steps.js';
export * from './webhooks.js';
```

**File: `packages/db/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

#### 3. Run tests

```bash
pnpm --filter @r360/db test
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| Schema imports fail | Ensure barrel exports in `schema/index.ts` |
| Enum not found | Verify `pgEnum` is imported from `drizzle-orm/pg-core` |
| Type errors on references | Ensure foreign key tables are imported correctly |

#### 5. Refactor

- Extract common column patterns (timestamps, tenant_id) into a helper if Drizzle supports it
- Generate initial migration: `pnpm --filter @r360/db generate`

### Success Criteria

- [ ] All 7 tables defined with Drizzle ORM
- [ ] Every tenant-scoped table has `tenantId` column with foreign key to `tenants.id`
- [ ] All tables have appropriate indexes for common query patterns
- [ ] Migration files generated successfully via `drizzle-kit generate`
- [ ] Migrations apply cleanly to a fresh database

### Verification Commands

```bash
pnpm --filter @r360/db test
pnpm --filter @r360/db generate
DATABASE_URL=postgresql://r360:r360_dev_password@localhost:5432/r360flow pnpm --filter @r360/db migrate
```

---

## Step 1.4: Shared Types Package

### Objective

Build the `@r360/types` package with all TypeScript types, branded IDs, enums, API request/response shapes, and Zod validation schemas shared across `api` and `db`.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/types/src/__tests__/validators.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  PaginationSchema,
  CreateCredentialSchema,
} from '../validators.js';

describe('Zod Validators', () => {
  describe('CreateWorkflowSchema', () => {
    it('accepts valid workflow input', () => {
      const result = CreateWorkflowSchema.safeParse({
        name: 'My Workflow',
        description: 'A test workflow',
        definitionJson: { nodes: [], edges: [] },
      });
      expect(result.success).toBe(true);
    });

    it('rejects workflow without name', () => {
      const result = CreateWorkflowSchema.safeParse({
        definitionJson: {},
      });
      expect(result.success).toBe(false);
    });

    it('rejects name longer than 255 chars', () => {
      const result = CreateWorkflowSchema.safeParse({
        name: 'x'.repeat(256),
        definitionJson: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PaginationSchema', () => {
    it('defaults page to 1 and limit to 20', () => {
      const result = PaginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('caps limit at 100', () => {
      const result = PaginationSchema.safeParse({ limit: 500 });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateCredentialSchema', () => {
    it('accepts valid credential input', () => {
      const result = CreateCredentialSchema.safeParse({
        name: 'My Slack Token',
        type: 'slackApi',
        data: { token: 'xoxb-test-token' },
      });
      expect(result.success).toBe(true);
    });
  });
});
```

#### 2. Implement

**File: `packages/types/src/index.ts`**

```typescript
// Branded types
export type TenantId = string & { readonly __brand: 'TenantId' };
export type UserId = string & { readonly __brand: 'UserId' };
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };
export type CredentialId = string & { readonly __brand: 'CredentialId' };
export type ExecutionId = string & { readonly __brand: 'ExecutionId' };

// For runtime checking (test exports)
export const TenantId = { __brand: 'TenantId' as const };

// Enums
export const WorkflowStatus = {
  Draft: 'draft',
  Active: 'active',
  Inactive: 'inactive',
  Archived: 'archived',
} as const;
export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

export const ExecutionStatus = {
  Pending: 'pending',
  Running: 'running',
  Success: 'success',
  Error: 'error',
  Cancelled: 'cancelled',
  Timeout: 'timeout',
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const UserRole = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
  Viewer: 'viewer',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Plan = {
  Free: 'free',
  Starter: 'starter',
  Pro: 'pro',
  Enterprise: 'enterprise',
} as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

// API types
export interface TenantContext {
  tenantId: TenantId;
  userId: UserId;
  role: UserRole;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

// Workflow API types
export interface WorkflowResponse {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  definitionJson: Record<string, unknown>;
  status: WorkflowStatus;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialResponse {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Note: encryptedData is NEVER returned to the client
}

export interface ExecutionResponse {
  id: string;
  tenantId: string;
  workflowId: string;
  status: ExecutionStatus;
  mode: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ExecutionDetailResponse extends ExecutionResponse {
  contextJson: Record<string, unknown>;
  steps: ExecutionStepResponse[];
}

export interface ExecutionStepResponse {
  id: string;
  nodeId: string;
  nodeName: string | null;
  nodeType: string | null;
  status: string;
  inputJson: unknown;
  outputJson: unknown;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
}

// Re-export validators
export * from './validators.js';
```

**File: `packages/types/src/validators.ts`**

```typescript
import { z } from 'zod';

// -- Pagination --
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;

// -- Workflows --
export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  definitionJson: z.record(z.unknown()).default({}),
});
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  definitionJson: z.record(z.unknown()).optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;

// -- Credentials --
export const CreateCredentialSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(128),
  data: z.record(z.unknown()),
});
export type CreateCredentialInput = z.infer<typeof CreateCredentialSchema>;

export const UpdateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  data: z.record(z.unknown()).optional(),
});
export type UpdateCredentialInput = z.infer<typeof UpdateCredentialSchema>;

// -- Executions --
export const TriggerExecutionSchema = z.object({
  inputData: z.record(z.unknown()).optional(),
});
export type TriggerExecutionInput = z.infer<typeof TriggerExecutionSchema>;

// -- UUID param --
export const UuidParamSchema = z.object({
  id: z.string().uuid(),
});
```

#### 3. Run tests

```bash
pnpm --filter @r360/types test
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| `zod` not found | Add `zod` as dependency to `packages/types/package.json` |
| Validator import fails | Verify `validators.ts` is created and exported from `index.ts` |

#### 5. Refactor

- Ensure all types are well-documented with JSDoc comments
- Consider splitting types into sub-modules if the file grows beyond 300 lines

### Success Criteria

- [ ] Branded ID types exported and usable
- [ ] All enums match database enum values exactly
- [ ] Zod schemas validate correctly with edge cases tested
- [ ] Package builds and is consumable by `@r360/api` and `@r360/db`

### Verification Commands

```bash
pnpm --filter @r360/types test
pnpm --filter @r360/types build
pnpm --filter @r360/types typecheck
```

---

## Step 1.5: Auth & Tenant Middleware

### Objective

Implement JWT-based authentication middleware that extracts tenant context from every request, enforces RBAC (owner > admin > member > viewer), and ensures no API route operates without a valid `tenantId`.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/api/src/__tests__/middleware/auth.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestServer } from '../helpers/test-server.js';
import { signTestToken } from '../helpers/test-auth.js';

describe('Auth Middleware', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;

  beforeAll(async () => {
    app = await createTestServer();
  });

  it('rejects requests without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('Unauthorized');
  });

  it('rejects requests with invalid JWT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { authorization: 'Bearer invalid-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects requests with expired JWT', async () => {
    const token = await signTestToken({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'member',
      exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it('accepts requests with valid JWT and populates tenant context', async () => {
    const token = await signTestToken({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'admin',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${token}` },
    });
    // Should get past auth (may be 200 or 404 depending on data, but NOT 401)
    expect(response.statusCode).not.toBe(401);
  });
});

describe('RBAC Middleware', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;

  beforeAll(async () => {
    app = await createTestServer();
  });

  it('viewer cannot create workflows', async () => {
    const token = await signTestToken({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'viewer',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Test', definitionJson: {} },
    });
    expect(response.statusCode).toBe(403);
  });

  it('member can create workflows', async () => {
    const token = await signTestToken({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'member',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Test', definitionJson: {} },
    });
    // Should get past RBAC (may fail on DB, but NOT 403)
    expect(response.statusCode).not.toBe(403);
  });
});
```

#### 2. Implement

**File: `packages/api/src/middleware/auth.ts`**

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import type { TenantContext, UserRole } from '@r360/types';

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 40,
  admin: 30,
  member: 20,
  viewer: 10,
};

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext: TenantContext;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
      statusCode: 401,
    });
  }

  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: process.env.JWT_ISSUER ?? 'r360-flow',
      audience: process.env.JWT_AUDIENCE ?? 'r360-flow-api',
    });

    const tenantId = payload.tenantId as string;
    const userId = payload.userId as string;
    const role = payload.role as UserRole;

    if (!tenantId || !userId || !role) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Token missing required claims (tenantId, userId, role)',
        statusCode: 401,
      });
    }

    request.tenantContext = {
      tenantId: tenantId as TenantContext['tenantId'],
      userId: userId as TenantContext['userId'],
      role,
    };
  } catch (err) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
      statusCode: 401,
    });
  }
}

export function requireRole(minimumRole: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userLevel = ROLE_HIERARCHY[request.tenantContext.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 0;

    if (userLevel < requiredLevel) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Requires ${minimumRole} role or higher`,
        statusCode: 403,
      });
    }
  };
}
```

**File: `packages/api/src/__tests__/helpers/test-auth.ts`**

```typescript
import * as jose from 'jose';

const TEST_SECRET = new TextEncoder().encode(
  'dev-secret-change-in-production-min-32-chars!!'
);

interface TestTokenPayload {
  tenantId: string;
  userId: string;
  role: string;
  exp?: number;
}

export async function signTestToken(payload: TestTokenPayload): Promise<string> {
  const builder = new jose.SignJWT({
    tenantId: payload.tenantId,
    userId: payload.userId,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('r360-flow')
    .setAudience('r360-flow-api')
    .setIssuedAt();

  if (payload.exp) {
    // Use raw expiration timestamp
    builder.setExpirationTime(payload.exp);
  } else {
    builder.setExpirationTime('24h');
  }

  return builder.sign(TEST_SECRET);
}
```

#### 3. Run tests

```bash
pnpm --filter @r360/api test
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| `jose` import fails | Ensure `jose` is in `@r360/api` dependencies |
| JWT_SECRET not set | Set env in test setup file or vitest config |
| Fastify request augmentation fails | Verify module augmentation syntax in `auth.ts` |

#### 5. Refactor

- Add token refresh logic stub
- Add request ID generation middleware for tracing

### Success Criteria

- [ ] Unauthenticated requests get 401
- [ ] Invalid/expired JWTs get 401
- [ ] Valid JWT populates `request.tenantContext` with `tenantId`, `userId`, `role`
- [ ] RBAC: viewer < member < admin < owner hierarchy enforced
- [ ] No route operates without tenant context

### Verification Commands

```bash
pnpm --filter @r360/api test -- --grep "Auth"
pnpm --filter @r360/api test -- --grep "RBAC"
```

---

## Step 1.6: Workflow CRUD API

### Objective

Implement tenant-scoped Workflow CRUD endpoints with Zod validation, pagination, sorting, and soft-delete. Every database query includes `tenant_id` filtering -- no exceptions.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/api/src/__tests__/routes/workflows.test.ts`**

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestServer } from '../helpers/test-server.js';
import { signTestToken } from '../helpers/test-auth.js';

describe('Workflow CRUD API', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;
  let tenantAToken: string;
  let tenantBToken: string;

  beforeAll(async () => {
    app = await createTestServer();
    tenantAToken = await signTestToken({
      tenantId: 'tenant-a',
      userId: 'user-1',
      role: 'admin',
    });
    tenantBToken = await signTestToken({
      tenantId: 'tenant-b',
      userId: 'user-2',
      role: 'admin',
    });
  });

  describe('POST /api/workflows', () => {
    it('creates a workflow for the authenticated tenant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: {
          name: 'My First Workflow',
          description: 'A test workflow',
          definitionJson: { nodes: [], edges: [] },
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('My First Workflow');
      expect(body.tenantId).toBe('tenant-a');
      expect(body.status).toBe('draft');
    });

    it('rejects invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { definitionJson: {} }, // missing name
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/workflows', () => {
    it('returns only workflows for the authenticated tenant', async () => {
      // Create workflow for tenant A
      await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Tenant A Workflow', definitionJson: {} },
      });

      // List as tenant B -- should NOT see tenant A's workflow
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantBToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const names = body.data.map((w: any) => w.name);
      expect(names).not.toContain('Tenant A Workflow');
    });

    it('supports pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows?page=1&limit=5',
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/workflows/:id', () => {
    it('returns 404 for workflow belonging to different tenant', async () => {
      // Create as tenant A
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Private Workflow', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      // Fetch as tenant B
      const response = await app.inject({
        method: 'GET',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantBToken}` },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/workflows/:id', () => {
    it('updates workflow name and description', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Original Name', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Updated Name', description: 'Now with desc' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('Updated Name');
    });
  });

  describe('DELETE /api/workflows/:id', () => {
    it('soft-deletes by setting status to archived', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'To Delete', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(response.statusCode).toBe(200);

      // Verify it's archived
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(getRes.json().status).toBe('archived');
    });
  });
});
```

#### 2. Implement

**File: `packages/api/src/routes/workflows.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { eq, and, count, desc, asc, SQL } from 'drizzle-orm';
import { workflows } from '@r360/db/schema';
import { getDb } from '@r360/db';
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  PaginationSchema,
  UuidParamSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth.js';

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  // CREATE
  app.post(
    '/api/workflows',
    { preHandler: [requireRole('member')] },
    async (request, reply) => {
      const parsed = CreateWorkflowSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const { tenantId, userId } = request.tenantContext;
      const db = getDb();

      const [workflow] = await db
        .insert(workflows)
        .values({
          tenantId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          definitionJson: parsed.data.definitionJson,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      return reply.status(201).send(workflow);
    }
  );

  // LIST (paginated)
  app.get('/api/workflows', async (request, reply) => {
    const pagination = PaginationSchema.parse(request.query);
    const { tenantId } = request.tenantContext;
    const db = getDb();

    const offset = (pagination.page - 1) * pagination.limit;

    const orderDirection = pagination.sortOrder === 'asc' ? asc : desc;
    const orderColumn =
      pagination.sortBy === 'name' ? workflows.name : workflows.updatedAt;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(workflows)
        .where(and(eq(workflows.tenantId, tenantId)))
        .orderBy(orderDirection(orderColumn))
        .limit(pagination.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(workflows)
        .where(and(eq(workflows.tenantId, tenantId))),
    ]);

    return reply.send({
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    });
  });

  // GET by ID
  app.get('/api/workflows/:id', async (request, reply) => {
    const params = UuidParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid workflow ID',
        statusCode: 400,
      });
    }

    const { tenantId } = request.tenantContext;
    const db = getDb();

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(
        and(eq(workflows.id, params.data.id), eq(workflows.tenantId, tenantId))
      );

    if (!workflow) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Workflow not found',
        statusCode: 404,
      });
    }

    return reply.send(workflow);
  });

  // UPDATE
  app.put(
    '/api/workflows/:id',
    { preHandler: [requireRole('member')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid workflow ID',
          statusCode: 400,
        });
      }

      const parsed = UpdateWorkflowSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const { tenantId, userId } = request.tenantContext;
      const db = getDb();

      const [workflow] = await db
        .update(workflows)
        .set({
          ...parsed.data,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workflows.id, params.data.id), eq(workflows.tenantId, tenantId))
        )
        .returning();

      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
          statusCode: 404,
        });
      }

      return reply.send(workflow);
    }
  );

  // DELETE (soft delete -> archive)
  app.delete(
    '/api/workflows/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid workflow ID',
          statusCode: 400,
        });
      }

      const { tenantId } = request.tenantContext;
      const db = getDb();

      const [workflow] = await db
        .update(workflows)
        .set({
          status: 'archived',
          isActive: false,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workflows.id, params.data.id), eq(workflows.tenantId, tenantId))
        )
        .returning();

      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
          statusCode: 404,
        });
      }

      return reply.send({ message: 'Workflow archived', workflow });
    }
  );
}
```

#### 3. Run tests

```bash
pnpm --filter @r360/api test -- --grep "Workflow CRUD"
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| DB not available in tests | Use test setup that seeds a test database or mocks DB layer |
| `workflows` import fails | Verify `@r360/db` exports schema correctly |
| Pagination total is wrong | Verify `count()` is imported from `drizzle-orm` |
| Tenant isolation fails | Verify WHERE clause always includes `eq(workflows.tenantId, tenantId)` |

#### 5. Refactor

- Extract common paginated-list pattern to a utility function
- Add search/filter by name and status
- Add `?status=active` query parameter filtering

### Success Criteria

- [ ] `POST /api/workflows` creates tenant-scoped workflow, returns 201
- [ ] `GET /api/workflows` returns paginated list filtered by tenant
- [ ] `GET /api/workflows/:id` returns 404 for cross-tenant access
- [ ] `PUT /api/workflows/:id` updates only own tenant's workflows
- [ ] `DELETE /api/workflows/:id` soft-deletes (sets status to archived)
- [ ] All endpoints validate input with Zod schemas
- [ ] All database queries include `tenant_id` filtering

### Verification Commands

```bash
pnpm --filter @r360/api test -- --grep "Workflow"
```

---

## Step 1.7: Credential CRUD API (Per-Tenant Encryption)

### Objective

Implement credential storage with per-tenant AES-256-GCM encryption. Credentials are encrypted before writing to the database and decrypted only when needed for execution. The encrypted data is **never** returned to the client.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/api/src/__tests__/routes/credentials.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestServer } from '../helpers/test-server.js';
import { signTestToken } from '../helpers/test-auth.js';

describe('Credential CRUD API', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;
  let token: string;

  beforeAll(async () => {
    app = await createTestServer();
    token = await signTestToken({
      tenantId: 'tenant-cred',
      userId: 'user-1',
      role: 'admin',
    });
  });

  describe('POST /api/credentials', () => {
    it('creates an encrypted credential', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Slack Bot Token',
          type: 'slackApi',
          data: { token: 'xoxb-secret-value' },
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Slack Bot Token');
      // Must NOT return encrypted data to client
      expect(body.encryptedData).toBeUndefined();
      expect(body.data).toBeUndefined();
    });
  });

  describe('GET /api/credentials', () => {
    it('lists credentials without exposing encrypted data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      for (const cred of body.data) {
        expect(cred.encryptedData).toBeUndefined();
        expect(cred.data).toBeUndefined();
      }
    });
  });

  describe('Tenant Isolation', () => {
    it('cannot access credentials from another tenant', async () => {
      // Create as tenant-cred
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Secret Cred',
          type: 'httpBasicAuth',
          data: { username: 'admin', password: 'secret' },
        },
      });
      const credId = createRes.json().id;

      // Try to access as different tenant
      const otherToken = await signTestToken({
        tenantId: 'tenant-other',
        userId: 'user-other',
        role: 'admin',
      });
      const response = await app.inject({
        method: 'GET',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
```

#### 2. Implement

**File: `packages/api/src/services/encryption.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Derives a per-tenant encryption key from the master key and tenant ID.
 * Uses scrypt for key derivation.
 */
function deriveKey(masterKey: string, tenantId: string): Buffer {
  return scryptSync(masterKey, `r360-tenant-${tenantId}`, 32);
}

/**
 * Encrypts credential data with a per-tenant derived key.
 * Format: base64(salt + iv + tag + ciphertext)
 */
export function encryptCredentialData(
  data: Record<string, unknown>,
  tenantId: string
): string {
  const masterKey = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY environment variable is required');
  }

  const key = deriveKey(masterKey, tenantId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Concatenate: iv + tag + ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts credential data with a per-tenant derived key.
 */
export function decryptCredentialData(
  encryptedBase64: string,
  tenantId: string
): Record<string, unknown> {
  const masterKey = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY environment variable is required');
  }

  const key = deriveKey(masterKey, tenantId);
  const combined = Buffer.from(encryptedBase64, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}
```

**File: `packages/api/src/routes/credentials.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { credentials } from '@r360/db/schema';
import { getDb } from '@r360/db';
import {
  CreateCredentialSchema,
  UpdateCredentialSchema,
  PaginationSchema,
  UuidParamSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth.js';
import { encryptCredentialData } from '../services/encryption.js';

/** Strip encryptedData from credential before sending to client */
function sanitizeCredential(cred: typeof credentials.$inferSelect) {
  const { encryptedData, ...safe } = cred;
  return safe;
}

export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  // CREATE
  app.post(
    '/api/credentials',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const parsed = CreateCredentialSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const { tenantId, userId } = request.tenantContext;
      const db = getDb();

      const encrypted = encryptCredentialData(parsed.data.data, tenantId);

      const [credential] = await db
        .insert(credentials)
        .values({
          tenantId,
          name: parsed.data.name,
          type: parsed.data.type,
          encryptedData: encrypted,
          createdBy: userId,
        })
        .returning();

      return reply.status(201).send(sanitizeCredential(credential));
    }
  );

  // LIST
  app.get('/api/credentials', async (request, reply) => {
    const pagination = PaginationSchema.parse(request.query);
    const { tenantId } = request.tenantContext;
    const db = getDb();
    const offset = (pagination.page - 1) * pagination.limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(credentials)
        .where(eq(credentials.tenantId, tenantId))
        .limit(pagination.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(credentials)
        .where(eq(credentials.tenantId, tenantId)),
    ]);

    return reply.send({
      data: data.map(sanitizeCredential),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    });
  });

  // GET by ID (metadata only, no decryption)
  app.get('/api/credentials/:id', async (request, reply) => {
    const params = UuidParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid credential ID',
        statusCode: 400,
      });
    }

    const { tenantId } = request.tenantContext;
    const db = getDb();

    const [credential] = await db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.id, params.data.id),
          eq(credentials.tenantId, tenantId)
        )
      );

    if (!credential) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Credential not found',
        statusCode: 404,
      });
    }

    return reply.send(sanitizeCredential(credential));
  });

  // UPDATE
  app.put(
    '/api/credentials/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid credential ID',
          statusCode: 400,
        });
      }

      const parsed = UpdateCredentialSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const { tenantId } = request.tenantContext;
      const db = getDb();
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (parsed.data.name) updates.name = parsed.data.name;
      if (parsed.data.data) {
        updates.encryptedData = encryptCredentialData(parsed.data.data, tenantId);
      }

      const [credential] = await db
        .update(credentials)
        .set(updates)
        .where(
          and(
            eq(credentials.id, params.data.id),
            eq(credentials.tenantId, tenantId)
          )
        )
        .returning();

      if (!credential) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Credential not found',
          statusCode: 404,
        });
      }

      return reply.send(sanitizeCredential(credential));
    }
  );

  // DELETE (hard delete -- credentials should be fully removed)
  app.delete(
    '/api/credentials/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid credential ID',
          statusCode: 400,
        });
      }

      const { tenantId } = request.tenantContext;
      const db = getDb();

      const [deleted] = await db
        .delete(credentials)
        .where(
          and(
            eq(credentials.id, params.data.id),
            eq(credentials.tenantId, tenantId)
          )
        )
        .returning();

      if (!deleted) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Credential not found',
          statusCode: 404,
        });
      }

      return reply.send({ message: 'Credential deleted' });
    }
  );
}
```

#### 3. Run tests

```bash
pnpm --filter @r360/api test -- --grep "Credential"
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| `MASTER_ENCRYPTION_KEY` not set | Add to test setup env |
| Encryption/decryption roundtrip fails | Verify IV and tag lengths match in encrypt/decrypt |
| `encryptedData` leaks to client | Verify `sanitizeCredential` strips the field |

#### 5. Refactor

- Add unit tests for encryption service roundtrip
- Add credential type validation against a known list

### Success Criteria

- [ ] Credentials are encrypted with per-tenant derived keys (AES-256-GCM)
- [ ] Encrypted data is NEVER returned in API responses
- [ ] Per-tenant key derivation uses scrypt with tenant-specific salt
- [ ] Tenant isolation: no cross-tenant credential access
- [ ] Hard delete for credentials (not soft delete)
- [ ] Encryption roundtrip test passes

### Verification Commands

```bash
pnpm --filter @r360/api test -- --grep "Credential"
pnpm --filter @r360/api test -- --grep "encryption"
```

---

## Step 1.8: Execution History API

### Objective

Implement execution history endpoints with a stub execute trigger. The actual n8n execution engine comes in Phase 3 -- here we set up the data model, recording, and retrieval. The stub execute creates a "pending" execution record that a future queue worker will process.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/api/src/__tests__/routes/executions.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestServer } from '../helpers/test-server.js';
import { signTestToken } from '../helpers/test-auth.js';

describe('Execution History API', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;
  let token: string;
  let workflowId: string;

  beforeAll(async () => {
    app = await createTestServer();
    token = await signTestToken({
      tenantId: 'tenant-exec',
      userId: 'user-1',
      role: 'admin',
    });

    // Create a workflow to execute
    const res = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Test Workflow', definitionJson: { nodes: [], edges: [] } },
    });
    workflowId = res.json().id;
  });

  describe('POST /api/workflows/:id/execute', () => {
    it('creates a pending execution record', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/execute`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(202); // Accepted
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.status).toBe('pending');
      expect(body.workflowId).toBe(workflowId);
    });
  });

  describe('GET /api/executions', () => {
    it('lists executions for the tenant', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/executions',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeInstanceOf(Array);
      expect(body.pagination).toBeDefined();
    });

    it('supports filtering by workflow ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/executions?workflowId=${workflowId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      for (const exec of body.data) {
        expect(exec.workflowId).toBe(workflowId);
      }
    });
  });

  describe('GET /api/executions/:id', () => {
    it('returns execution detail with steps', async () => {
      // Trigger an execution
      const execRes = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/execute`,
        headers: { authorization: `Bearer ${token}` },
      });
      const executionId = execRes.json().id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/executions/${executionId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(executionId);
      expect(body.steps).toBeInstanceOf(Array);
    });

    it('returns 404 for execution from different tenant', async () => {
      const execRes = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/execute`,
        headers: { authorization: `Bearer ${token}` },
      });
      const executionId = execRes.json().id;

      const otherToken = await signTestToken({
        tenantId: 'tenant-other',
        userId: 'user-other',
        role: 'admin',
      });
      const response = await app.inject({
        method: 'GET',
        url: `/api/executions/${executionId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
```

#### 2. Implement

**File: `packages/api/src/routes/executions.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { eq, and, count, desc } from 'drizzle-orm';
import { executions, executionSteps, workflows } from '@r360/db/schema';
import { getDb } from '@r360/db';
import {
  PaginationSchema,
  UuidParamSchema,
  TriggerExecutionSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth.js';
import { z } from 'zod';

const ExecutionQuerySchema = PaginationSchema.extend({
  workflowId: z.string().uuid().optional(),
  status: z.enum(['pending', 'running', 'success', 'error', 'cancelled', 'timeout']).optional(),
});

export async function executionRoutes(app: FastifyInstance): Promise<void> {
  // TRIGGER EXECUTION (stub -- creates pending record)
  app.post(
    '/api/workflows/:id/execute',
    { preHandler: [requireRole('member')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid workflow ID',
          statusCode: 400,
        });
      }

      const parsed = TriggerExecutionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const { tenantId } = request.tenantContext;
      const db = getDb();

      // Verify workflow exists and belongs to tenant
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, params.data.id),
            eq(workflows.tenantId, tenantId)
          )
        );

      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
          statusCode: 404,
        });
      }

      // Create pending execution record
      // In Phase 3, this will also enqueue a BullMQ job
      const [execution] = await db
        .insert(executions)
        .values({
          tenantId,
          workflowId: params.data.id,
          status: 'pending',
          mode: 'manual',
          contextJson: parsed.data.inputData ?? {},
        })
        .returning();

      // Return 202 Accepted -- execution is queued, not completed
      return reply.status(202).send(execution);
    }
  );

  // LIST EXECUTIONS (paginated, filterable)
  app.get('/api/executions', async (request, reply) => {
    const query = ExecutionQuerySchema.parse(request.query);
    const { tenantId } = request.tenantContext;
    const db = getDb();
    const offset = (query.page - 1) * query.limit;

    // Build WHERE conditions
    const conditions = [eq(executions.tenantId, tenantId)];
    if (query.workflowId) {
      conditions.push(eq(executions.workflowId, query.workflowId));
    }
    if (query.status) {
      conditions.push(eq(executions.status, query.status));
    }

    const whereClause = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(executions)
        .where(whereClause)
        .orderBy(desc(executions.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(executions)
        .where(whereClause),
    ]);

    return reply.send({
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  });

  // GET EXECUTION DETAIL (with steps)
  app.get('/api/executions/:id', async (request, reply) => {
    const params = UuidParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid execution ID',
        statusCode: 400,
      });
    }

    const { tenantId } = request.tenantContext;
    const db = getDb();

    const [execution] = await db
      .select()
      .from(executions)
      .where(
        and(
          eq(executions.id, params.data.id),
          eq(executions.tenantId, tenantId)
        )
      );

    if (!execution) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Execution not found',
        statusCode: 404,
      });
    }

    // Fetch associated steps
    const steps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.executionId, execution.id))
      .orderBy(executionSteps.startedAt);

    return reply.send({
      ...execution,
      steps,
    });
  });
}
```

#### 3. Run tests

```bash
pnpm --filter @r360/api test -- --grep "Execution"
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| Workflow not found when triggering | Ensure workflow creation in `beforeAll` succeeds and uses same tenant |
| Foreign key constraint on execution insert | Ensure `workflowId` references an existing workflow |
| Steps not returned | Verify `executionSteps` table join query is correct |

#### 5. Refactor

- Add status transition validation (pending->running->success/error)
- Add execution cancellation endpoint stub

### Success Criteria

- [ ] `POST /api/workflows/:id/execute` creates a pending execution, returns 202
- [ ] `GET /api/executions` returns paginated, tenant-filtered list
- [ ] `GET /api/executions?workflowId=X` filters by workflow
- [ ] `GET /api/executions?status=pending` filters by status
- [ ] `GET /api/executions/:id` returns execution with associated steps
- [ ] Cross-tenant execution access returns 404
- [ ] Stub execute is ready for Phase 3 queue integration

### Verification Commands

```bash
pnpm --filter @r360/api test -- --grep "Execution"
```

---

## Step 1.9: Integration Test Suite

### Objective

Build a comprehensive integration test suite that verifies the full API surface against a real PostgreSQL database, with emphasis on tenant isolation. Tests run in a dedicated test database, with automatic setup and teardown.

### TDD Implementation

#### 1. Write failing tests first

**File: `packages/api/src/__tests__/integration/tenant-isolation.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer } from '../helpers/test-server.js';
import { signTestToken } from '../helpers/test-auth.js';

describe('Tenant Isolation (Integration)', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;
  let tenantAToken: string;
  let tenantBToken: string;

  beforeAll(async () => {
    app = await createTestServer();
    tenantAToken = await signTestToken({
      tenantId: 'isolation-tenant-a',
      userId: 'user-a',
      role: 'admin',
    });
    tenantBToken = await signTestToken({
      tenantId: 'isolation-tenant-b',
      userId: 'user-b',
      role: 'admin',
    });
  });

  it('tenant A cannot see tenant B workflows', async () => {
    // Tenant B creates a workflow
    await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: { name: 'Secret B Workflow', definitionJson: {} },
    });

    // Tenant A lists workflows
    const res = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantAToken}` },
    });

    const names = res.json().data.map((w: any) => w.name);
    expect(names).not.toContain('Secret B Workflow');
  });

  it('tenant A cannot see tenant B credentials', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/credentials',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: { name: 'B Secret Key', type: 'apiKey', data: { key: 'xxx' } },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/credentials',
      headers: { authorization: `Bearer ${tenantAToken}` },
    });

    const names = res.json().data.map((c: any) => c.name);
    expect(names).not.toContain('B Secret Key');
  });

  it('tenant A cannot see tenant B executions', async () => {
    // Create workflow for tenant B
    const wfRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: { name: 'B Exec Workflow', definitionJson: {} },
    });
    const workflowId = wfRes.json().id;

    // Execute as tenant B
    await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/execute`,
      headers: { authorization: `Bearer ${tenantBToken}` },
    });

    // Tenant A lists executions
    const res = await app.inject({
      method: 'GET',
      url: '/api/executions',
      headers: { authorization: `Bearer ${tenantAToken}` },
    });

    const wfIds = res.json().data.map((e: any) => e.workflowId);
    expect(wfIds).not.toContain(workflowId);
  });

  it('tenant A cannot update tenant B workflow by ID', async () => {
    const wfRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: { name: 'B Protected', definitionJson: {} },
    });
    const workflowId = wfRes.json().id;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/workflows/${workflowId}`,
      headers: { authorization: `Bearer ${tenantAToken}` },
      payload: { name: 'Hijacked!' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('tenant A cannot delete tenant B workflow by ID', async () => {
    const wfRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: { name: 'B Undeletable', definitionJson: {} },
    });
    const workflowId = wfRes.json().id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/workflows/${workflowId}`,
      headers: { authorization: `Bearer ${tenantAToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('tenant A cannot trigger execution on tenant B workflow', async () => {
    const wfRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: { name: 'B No Execute', definitionJson: {} },
    });
    const workflowId = wfRes.json().id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/execute`,
      headers: { authorization: `Bearer ${tenantAToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

**File: `packages/api/src/__tests__/integration/api-health.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestServer } from '../helpers/test-server.js';

describe('API Health (Integration)', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;

  beforeAll(async () => {
    app = await createTestServer();
  });

  it('GET /health returns 200 with database and redis status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBeDefined();
    expect(body.redis).toBeDefined();
  });

  it('GET /api/anything without auth returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
    });
    expect(response.statusCode).toBe(401);
  });
});
```

**File: `packages/api/src/__tests__/integration/encryption.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { encryptCredentialData, decryptCredentialData } from '../../services/encryption.js';

describe('Credential Encryption (Integration)', () => {
  const testData = {
    token: 'xoxb-test-secret-token',
    apiKey: 'sk-12345',
    nested: { deep: { value: 'secret' } },
  };

  it('encrypts and decrypts data correctly', () => {
    const encrypted = encryptCredentialData(testData, 'tenant-1');
    const decrypted = decryptCredentialData(encrypted, 'tenant-1');
    expect(decrypted).toEqual(testData);
  });

  it('different tenants produce different ciphertexts', () => {
    const enc1 = encryptCredentialData(testData, 'tenant-1');
    const enc2 = encryptCredentialData(testData, 'tenant-2');
    expect(enc1).not.toBe(enc2);
  });

  it('cannot decrypt with wrong tenant ID', () => {
    const encrypted = encryptCredentialData(testData, 'tenant-1');
    expect(() => decryptCredentialData(encrypted, 'tenant-2')).toThrow();
  });

  it('same tenant encrypting same data produces different ciphertexts (random IV)', () => {
    const enc1 = encryptCredentialData(testData, 'tenant-1');
    const enc2 = encryptCredentialData(testData, 'tenant-1');
    expect(enc1).not.toBe(enc2); // Different IVs
    // But both decrypt to the same value
    expect(decryptCredentialData(enc1, 'tenant-1')).toEqual(testData);
    expect(decryptCredentialData(enc2, 'tenant-1')).toEqual(testData);
  });
});
```

#### 2. Implement

**File: `packages/api/src/__tests__/helpers/test-server.ts`**

```typescript
import Fastify from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { workflowRoutes } from '../../routes/workflows.js';
import { credentialRoutes } from '../../routes/credentials.js';
import { executionRoutes } from '../../routes/executions.js';
import { healthRoutes } from '../../routes/health.js';

export async function createTestServer() {
  const app = Fastify({ logger: false });

  // Health routes (no auth)
  await app.register(healthRoutes);

  // Auth middleware for /api/* routes
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      await authMiddleware(request, reply);
    }
  });

  // Register route modules
  await app.register(workflowRoutes);
  await app.register(credentialRoutes);
  await app.register(executionRoutes);

  await app.ready();
  return app;
}
```

**File: `packages/api/src/routes/health.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { getDb } from '@r360/db';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const checks: Record<string, string> = {};

    // Database check
    try {
      const db = getDb();
      await db.execute('SELECT 1');
      checks.database = 'connected';
    } catch {
      checks.database = 'disconnected';
    }

    // Redis check (stub for now)
    checks.redis = 'not_configured';

    const allHealthy = checks.database === 'connected';

    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      ...checks,
    });
  });
}
```

**File: `packages/api/vitest.integration.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/integration/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',       // Isolate tests in separate processes
    poolOptions: {
      forks: { singleFork: true }, // Serial execution for DB tests
    },
  },
});
```

**File: `packages/api/src/__tests__/setup.ts`**

```typescript
import { beforeAll, afterAll } from 'vitest';

// Set test environment variables
process.env.JWT_SECRET = 'dev-secret-change-in-production-min-32-chars!!';
process.env.JWT_ISSUER = 'r360-flow';
process.env.JWT_AUDIENCE = 'r360-flow-api';
process.env.MASTER_ENCRYPTION_KEY = 'dev-master-key-change-in-production-256bit!!';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://r360:r360_dev_password@localhost:5432/r360flow_test';

beforeAll(async () => {
  // Run migrations or sync schema for test DB
  // This would use Drizzle's migrate() function
});

afterAll(async () => {
  // Close DB connections
  const { closeConnection } = await import('@r360/db');
  await closeConnection();
});
```

#### 3. Run tests

```bash
# Start infrastructure
cd infrastructure && docker compose up -d

# Run all integration tests
pnpm --filter @r360/api test:integration
```

#### 4. If tests fail

| Failure | Fix |
|---------|-----|
| Test DB does not exist | Create `r360flow_test` database: `docker exec r360-postgres createdb -U r360 r360flow_test` |
| Schema not migrated in test DB | Run migrations against test DB in `setup.ts` |
| Tests interfere with each other | Ensure serial execution via `singleFork: true` or add per-test cleanup |
| Port conflict | Ensure tests use Fastify's `inject()` (no real port needed) |

#### 5. Refactor

- Add test data factories (e.g., `createTestWorkflow()`, `createTestCredential()`)
- Add cleanup between test suites that truncates tables
- Add CI pipeline configuration for running integration tests

### Success Criteria

- [ ] All tenant isolation tests pass -- no cross-tenant data leakage
- [ ] Health check endpoint returns database and redis status
- [ ] Encryption roundtrip tests pass with different tenants
- [ ] Test suite runs against real PostgreSQL (not mocks)
- [ ] Tests are isolated -- no shared state between suites
- [ ] Full API surface tested: auth, RBAC, CRUD, pagination, encryption

### Verification Commands

```bash
# Full integration suite
pnpm --filter @r360/api test:integration

# All tests across all packages
pnpm -r test

# Type checking
pnpm -r typecheck
```

---

## Phase Completion Checklist

- [ ] **1.1** Monorepo scaffolding: pnpm workspace, 3 packages, shared tsconfig, Vitest, ESLint
- [ ] **1.2** Docker Compose: PostgreSQL 16 + Redis 7, health checks, persistent volumes
- [ ] **1.3** Database schema: 7 Drizzle tables, all with `tenant_id`, migrations generated and applied
- [ ] **1.4** Shared types: branded IDs, enums, API types, Zod validators
- [ ] **1.5** Auth middleware: JWT verification, tenant context extraction, RBAC enforcement
- [ ] **1.6** Workflow CRUD: tenant-scoped create, list (paginated), get, update, soft-delete
- [ ] **1.7** Credential CRUD: per-tenant AES-256-GCM encryption, never expose encrypted data
- [ ] **1.8** Execution history: stub execute (pending record), list (filtered), detail with steps
- [ ] **1.9** Integration tests: tenant isolation verified, encryption roundtrip, full API coverage
- [ ] All tests pass: `pnpm -r test`
- [ ] All types check: `pnpm -r typecheck`
- [ ] Zero n8n dependencies installed (Cardinal Rule)
- [ ] Every database query includes `tenant_id` filtering

## Rollback Procedure

Phase 1 is greenfield -- there is no production system to roll back. If something goes wrong:

1. **Database**: Drop and recreate:
   ```bash
   docker exec r360-postgres dropdb -U r360 r360flow
   docker exec r360-postgres createdb -U r360 r360flow
   pnpm --filter @r360/db migrate
   ```

2. **Docker volumes**: Full reset:
   ```bash
   cd infrastructure && docker compose down -v
   docker compose up -d
   ```

3. **Package state**: Reset to last known good commit:
   ```bash
   git stash   # or git reset depending on severity
   pnpm install
   pnpm -r build
   ```

4. **Environment**: Verify all required env vars are set correctly by comparing against the Environment Setup section above.

---

**Next Phase**: [Phase 2: Connect Workflow Builder UI to API](./Phase2.md) -- Wire the frontend editor to this API for save/load workflow persistence.
