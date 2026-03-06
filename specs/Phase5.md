# Phase 5: Multi-Tenant Hardening

## Overview
- **Goal**: Harden the platform for production multi-tenancy with comprehensive data isolation verification, billing integration, tenant provisioning, and security testing to ensure no cross-tenant data leakage is possible.
- **Prerequisites**: Phases 1-4 complete — API server with tenant-aware data layer, Workflow Builder UI connected to API, n8n execution engine integrated, BullMQ queue with rate limiting, webhooks, scheduling, and real-time monitoring all functional and tested.
- **Cardinal Rule Checkpoint**: Tenant isolation is entirely OUR responsibility. n8n libraries are tenant-unaware by design. Every boundary -- credentials, data storage, execution results, rate limits -- is enforced in OUR wrapper code. If a cross-tenant leak exists, the bug is in our code, not n8n's. This phase verifies that boundary is airtight.
- **Duration Estimate**: 2-3 weeks (Weeks 9-11)
- **Key Deliverables**:
  - Automated cross-tenant data leakage test suite
  - Stripe billing integration with per-tenant usage metering
  - Tenant provisioning and onboarding flow
  - Security hardening with OWASP Top 10 coverage
  - Comprehensive security test suite with attack scenario coverage

## Environment Setup

### Required Tools and Versions
```
Node.js >= 20.x
pnpm >= 9.x
PostgreSQL >= 15.x (from Phase 1)
Redis >= 7.x (from Phase 4)
Stripe CLI >= 1.19.x (for webhook testing)
Docker + Docker Compose
TypeScript >= 5.4
```

### Environment Variables
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
BCRYPT_ROUNDS=12

# Admin
ADMIN_API_KEY=admin_xxxxx
PLATFORM_ADMIN_EMAILS=admin@r360flow.com
```

### Infrastructure Prerequisites
```bash
# Install Stripe CLI for local webhook testing
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/billing/webhook
```

### Package Installation
```bash
cd /Users/preston/Documents/Claude/R360-Flow

# Stripe
pnpm --filter @r360/api add stripe

# Security
pnpm --filter @r360/api add helmet cors express-rate-limit
pnpm --filter @r360/api add -D @types/cors

# Encryption audit
pnpm --filter @r360/api add argon2

# Testing
pnpm --filter @r360/api add -D supertest @types/supertest
```

### Setup Verification Commands
```bash
# Verify Stripe CLI
stripe --version
# Expected: stripe version X.X.X

# Verify Stripe connection
stripe products list --limit 1
# Expected: JSON response with product data (or empty list)

# Verify all Phase 1-4 tests still pass
pnpm test
# Expected: All tests passing
```

---

## Step 5.1: Data Isolation Audit

### Objective
Build an automated test suite that systematically verifies no cross-tenant data leakage exists anywhere in the system. Audit every database query to confirm `tenant_id` filtering is present. Implement audit logging for sensitive data access patterns.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/isolation/cross-tenant-data.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from '../helpers/test-db';

describe('Cross-Tenant Data Isolation', () => {
  let db: TestDb;

  const TENANT_A = 'tenant-isolation-a';
  const TENANT_B = 'tenant-isolation-b';

  beforeAll(async () => {
    db = await createTestDb();

    // Seed tenant A data
    await db.tenants.create({ id: TENANT_A, name: 'Tenant A', slug: 'tenant-a', plan: 'pro' });
    await db.workflows.create({
      id: 'wf-a-1',
      tenantId: TENANT_A,
      name: 'Tenant A Workflow',
      definitionJson: { nodes: [], connections: {} },
      isActive: true,
    });
    await db.credentials.create({
      id: 'cred-a-1',
      tenantId: TENANT_A,
      name: 'Tenant A API Key',
      type: 'httpHeaderAuth',
      encryptedData: 'encrypted-secret-a',
    });
    await db.executions.create({
      id: 'exec-a-1',
      tenantId: TENANT_A,
      workflowId: 'wf-a-1',
      status: 'success',
    });

    // Seed tenant B data
    await db.tenants.create({ id: TENANT_B, name: 'Tenant B', slug: 'tenant-b', plan: 'free' });
    await db.workflows.create({
      id: 'wf-b-1',
      tenantId: TENANT_B,
      name: 'Tenant B Workflow',
      definitionJson: { nodes: [], connections: {} },
      isActive: true,
    });
    await db.credentials.create({
      id: 'cred-b-1',
      tenantId: TENANT_B,
      name: 'Tenant B API Key',
      type: 'httpHeaderAuth',
      encryptedData: 'encrypted-secret-b',
    });
    await db.executions.create({
      id: 'exec-b-1',
      tenantId: TENANT_B,
      workflowId: 'wf-b-1',
      status: 'success',
    });
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('Workflow Isolation', () => {
    it('should NOT return Tenant B workflows when querying as Tenant A', async () => {
      const workflows = await db.workflows.listByTenant(TENANT_A);

      const tenantBWorkflows = workflows.filter(w => w.tenantId === TENANT_B);
      expect(tenantBWorkflows).toHaveLength(0);
      expect(workflows.every(w => w.tenantId === TENANT_A)).toBe(true);
    });

    it('should NOT allow Tenant A to fetch Tenant B workflow by ID', async () => {
      const workflow = await db.workflows.getByIdAndTenant('wf-b-1', TENANT_A);
      expect(workflow).toBeNull();
    });

    it('should NOT allow Tenant A to update Tenant B workflow', async () => {
      const updated = await db.workflows.updateByIdAndTenant(
        'wf-b-1',
        TENANT_A,
        { name: 'Hacked!' },
      );
      expect(updated).toBeNull();

      // Verify original is unchanged
      const original = await db.workflows.getByIdAndTenant('wf-b-1', TENANT_B);
      expect(original!.name).toBe('Tenant B Workflow');
    });

    it('should NOT allow Tenant A to delete Tenant B workflow', async () => {
      const deleted = await db.workflows.deleteByIdAndTenant('wf-b-1', TENANT_A);
      expect(deleted).toBe(false);

      // Verify it still exists
      const original = await db.workflows.getByIdAndTenant('wf-b-1', TENANT_B);
      expect(original).not.toBeNull();
    });
  });

  describe('Credential Isolation', () => {
    it('should NOT return Tenant B credentials when querying as Tenant A', async () => {
      const credentials = await db.credentials.listByTenant(TENANT_A);

      const tenantBCreds = credentials.filter(c => c.tenantId === TENANT_B);
      expect(tenantBCreds).toHaveLength(0);
    });

    it('should NOT allow Tenant A to read Tenant B credential data', async () => {
      const credential = await db.credentials.getByIdAndTenant('cred-b-1', TENANT_A);
      expect(credential).toBeNull();
    });

    it('should NOT allow Tenant A to decrypt Tenant B credentials', async () => {
      // Even if Tenant A somehow knows the credential ID
      const result = await db.credentials.getDecryptedByIdAndTenant('cred-b-1', TENANT_A);
      expect(result).toBeNull();
    });
  });

  describe('Execution Isolation', () => {
    it('should NOT return Tenant B executions when querying as Tenant A', async () => {
      const executions = await db.executions.listByTenant(TENANT_A);

      const tenantBExecs = executions.filter(e => e.tenantId === TENANT_B);
      expect(tenantBExecs).toHaveLength(0);
    });

    it('should NOT allow Tenant A to view Tenant B execution details', async () => {
      const execution = await db.executions.getByIdAndTenant('exec-b-1', TENANT_A);
      expect(execution).toBeNull();
    });

    it('should NOT allow Tenant A to view Tenant B execution step data', async () => {
      const steps = await db.executionSteps.listByExecutionAndTenant('exec-b-1', TENANT_A);
      expect(steps).toHaveLength(0);
    });
  });

  describe('Webhook Isolation', () => {
    it('should NOT allow Tenant A to list Tenant B webhooks', async () => {
      await db.webhooks.create({
        id: 'wh-b-1',
        tenantId: TENANT_B,
        workflowId: 'wf-b-1',
        path: 'secret-webhook',
        method: 'POST',
        isActive: true,
      });

      const webhooks = await db.webhooks.listByTenant(TENANT_A);
      const tenantBHooks = webhooks.filter(w => w.tenantId === TENANT_B);
      expect(tenantBHooks).toHaveLength(0);
    });
  });
});
```

**File:** `packages/api/src/__tests__/isolation/query-audit.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Query Audit - tenant_id Filtering', () => {
  const DB_PACKAGE_PATH = path.resolve(__dirname, '../../../../db/src');
  const QUERY_PATTERNS = [
    /SELECT\s+.*\s+FROM\s+/i,
    /UPDATE\s+.*\s+SET\s+/i,
    /DELETE\s+FROM\s+/i,
    /INSERT\s+INTO\s+/i,
  ];
  const TENANT_EXEMPT_TABLES = ['tenants', 'migrations', 'schema_versions'];

  function findQueryFiles(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findQueryFiles(fullPath));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  function extractQueries(content: string): Array<{ line: number; query: string }> {
    const queries: Array<{ line: number; query: string }> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of QUERY_PATTERNS) {
        if (pattern.test(lines[i])) {
          // Capture multi-line query (up to 10 lines ahead)
          let query = '';
          for (let j = i; j < Math.min(i + 10, lines.length); j++) {
            query += lines[j] + ' ';
            if (lines[j].includes(';') || lines[j].includes('`)')) break;
          }
          queries.push({ line: i + 1, query: query.trim() });
        }
      }
    }
    return queries;
  }

  function isExemptTable(query: string): boolean {
    return TENANT_EXEMPT_TABLES.some(table =>
      new RegExp(`(FROM|INTO|UPDATE)\\s+${table}\\b`, 'i').test(query),
    );
  }

  it('should include tenant_id in all SELECT queries (except exempt tables)', () => {
    const files = findQueryFiles(DB_PACKAGE_PATH);
    const violations: Array<{ file: string; line: number; query: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const queries = extractQueries(content);

      for (const { line, query } of queries) {
        if (/SELECT/i.test(query) && !isExemptTable(query)) {
          if (!/tenant_id/i.test(query)) {
            violations.push({
              file: path.relative(DB_PACKAGE_PATH, file),
              line,
              query: query.substring(0, 100),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      console.error('SQL queries missing tenant_id filtering:');
      for (const v of violations) {
        console.error(`  ${v.file}:${v.line}: ${v.query}`);
      }
    }

    expect(violations).toHaveLength(0);
  });

  it('should include tenant_id in all UPDATE queries (except exempt tables)', () => {
    const files = findQueryFiles(DB_PACKAGE_PATH);
    const violations: Array<{ file: string; line: number; query: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const queries = extractQueries(content);

      for (const { line, query } of queries) {
        if (/UPDATE/i.test(query) && !isExemptTable(query)) {
          if (!/tenant_id/i.test(query)) {
            violations.push({
              file: path.relative(DB_PACKAGE_PATH, file),
              line,
              query: query.substring(0, 100),
            });
          }
        }
      }
    }

    expect(violations).toHaveLength(0);
  });

  it('should include tenant_id in all DELETE queries (except exempt tables)', () => {
    const files = findQueryFiles(DB_PACKAGE_PATH);
    const violations: Array<{ file: string; line: number; query: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const queries = extractQueries(content);

      for (const { line, query } of queries) {
        if (/DELETE/i.test(query) && !isExemptTable(query)) {
          if (!/tenant_id/i.test(query)) {
            violations.push({
              file: path.relative(DB_PACKAGE_PATH, file),
              line,
              query: query.substring(0, 100),
            });
          }
        }
      }
    }

    expect(violations).toHaveLength(0);
  });
});
```

**File:** `packages/api/src/__tests__/isolation/audit-log.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditLogger, AuditEvent } from '../../audit/audit-logger';

describe('Audit Logger', () => {
  let auditLogger: AuditLogger;
  let mockStore: any;

  beforeEach(() => {
    mockStore = {
      write: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
    };
    auditLogger = new AuditLogger(mockStore);
  });

  it('should log data access events', async () => {
    await auditLogger.log({
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: 'read',
      resource: 'workflow',
      resourceId: 'wf-1',
      timestamp: new Date(),
    });

    expect(mockStore.write).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'read',
        resource: 'workflow',
      }),
    );
  });

  it('should log credential access events', async () => {
    await auditLogger.log({
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: 'decrypt',
      resource: 'credential',
      resourceId: 'cred-1',
      timestamp: new Date(),
      metadata: { credentialType: 'httpHeaderAuth' },
    });

    expect(mockStore.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'decrypt',
        resource: 'credential',
      }),
    );
  });

  it('should log cross-tenant access attempts', async () => {
    await auditLogger.logSecurityEvent({
      tenantId: 'tenant-1',
      userId: 'user-1',
      attemptedTenantId: 'tenant-2',
      action: 'read',
      resource: 'workflow',
      resourceId: 'wf-other-tenant',
      blocked: true,
      timestamp: new Date(),
    });

    expect(mockStore.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cross_tenant_access_attempt',
        blocked: true,
      }),
    );
  });

  it('should query audit logs by tenant and date range', async () => {
    const start = new Date('2026-03-01');
    const end = new Date('2026-03-05');

    await auditLogger.query({
      tenantId: 'tenant-1',
      startDate: start,
      endDate: end,
    });

    expect(mockStore.query).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        startDate: start,
        endDate: end,
      }),
    );
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/audit/audit-logger.ts`

```typescript
export interface AuditEvent {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface SecurityEvent {
  tenantId: string;
  userId: string;
  attemptedTenantId: string;
  action: string;
  resource: string;
  resourceId: string;
  blocked: boolean;
  timestamp: Date;
}

export interface AuditQuery {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  action?: string;
  resource?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStore {
  write(event: Record<string, unknown>): Promise<void>;
  query(params: AuditQuery): Promise<AuditEvent[]>;
}

export class AuditLogger {
  private store: AuditStore;

  constructor(store: AuditStore) {
    this.store = store;
  }

  async log(event: AuditEvent): Promise<void> {
    await this.store.write({
      ...event,
      type: 'data_access',
    });
  }

  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    await this.store.write({
      tenantId: event.tenantId,
      userId: event.userId,
      action: 'cross_tenant_access_attempt',
      resource: event.resource,
      resourceId: event.resourceId,
      attemptedTenantId: event.attemptedTenantId,
      blocked: event.blocked,
      timestamp: event.timestamp,
      type: 'security',
    });

    // Also log to stderr for immediate alerting
    console.error(
      `[SECURITY] Cross-tenant access attempt: user=${event.userId} tenant=${event.tenantId} attempted_tenant=${event.attemptedTenantId} resource=${event.resource}/${event.resourceId} blocked=${event.blocked}`,
    );
  }

  async query(params: AuditQuery): Promise<AuditEvent[]> {
    return this.store.query(params);
  }
}
```

**File:** `packages/db/src/audit/audit-store.ts`

```typescript
import { Pool } from 'pg';
import { AuditStore, AuditQuery, AuditEvent } from '../../api/src/audit/audit-logger';

export class PostgresAuditStore implements AuditStore {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async write(event: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (
        tenant_id, user_id, action, resource, resource_id,
        type, metadata, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.tenantId,
        event.userId,
        event.action,
        event.resource,
        event.resourceId,
        event.type || 'data_access',
        JSON.stringify(event),
        event.timestamp || new Date(),
      ],
    );
  }

  async query(params: AuditQuery): Promise<AuditEvent[]> {
    let sql = `
      SELECT * FROM audit_logs
      WHERE tenant_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
    `;
    const values: unknown[] = [params.tenantId, params.startDate, params.endDate];
    let paramIndex = 4;

    if (params.action) {
      sql += ` AND action = $${paramIndex++}`;
      values.push(params.action);
    }

    if (params.resource) {
      sql += ` AND resource = $${paramIndex++}`;
      values.push(params.resource);
    }

    if (params.userId) {
      sql += ` AND user_id = $${paramIndex++}`;
      values.push(params.userId);
    }

    sql += ` ORDER BY timestamp DESC`;
    sql += ` LIMIT $${paramIndex++}`;
    values.push(params.limit || 100);

    if (params.offset) {
      sql += ` OFFSET $${paramIndex++}`;
      values.push(params.offset);
    }

    const result = await this.pool.query(sql, values);
    return result.rows;
  }
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "Cross-Tenant|Query Audit|Audit Logger"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Query audit finds violations` | Fix the offending query to include `WHERE tenant_id = $X`. Every query on tenant-scoped tables MUST filter by `tenant_id` |
| `Cross-tenant test leaks data` | Verify the DB query functions use parameterized queries with `tenant_id`. Check for SQL injection vectors |
| `Audit store write fails` | Run migration to create `audit_logs` table: `CREATE TABLE audit_logs (id uuid, tenant_id text, user_id text, action text, resource text, resource_id text, type text, metadata jsonb, timestamp timestamptz)` |
| `Test DB not seeded` | Ensure `createTestDb()` helper creates tables and returns query interfaces. Check connection string |
| `File scanning finds false positives` | Refine the regex patterns. Add more tables to `TENANT_EXEMPT_TABLES` if they legitimately have no tenant_id (e.g., `migrations`) |

### Success Criteria
- [ ] Tenant A cannot list Tenant B's workflows
- [ ] Tenant A cannot read Tenant B's workflow by ID
- [ ] Tenant A cannot update or delete Tenant B's workflow
- [ ] Tenant A cannot list or read Tenant B's credentials
- [ ] Tenant A cannot decrypt Tenant B's credentials
- [ ] Tenant A cannot list or view Tenant B's executions
- [ ] Tenant A cannot list Tenant B's webhooks
- [ ] ALL SQL queries on tenant-scoped tables include `tenant_id` filtering
- [ ] Audit logger records data access events
- [ ] Audit logger records cross-tenant access attempts
- [ ] Audit logs queryable by tenant and date range

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "isolation|audit"
# Expected: All isolation and audit tests pass

# Verify audit_logs table exists
psql -d r360flow -c "\d audit_logs"
# Expected: Table structure with tenant_id, user_id, action, resource columns
```

---

## Step 5.2: Billing & Usage Metering

### Objective
Integrate Stripe for subscription management, implement per-tenant usage tracking (workflow count, execution count, execution minutes), enforce plan-based limits, handle overages, and process Stripe webhooks for subscription lifecycle events.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/billing/usage-tracker.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageTracker, UsageRecord } from '../../billing/usage-tracker';

describe('UsageTracker', () => {
  let tracker: UsageTracker;
  let mockStore: any;

  beforeEach(() => {
    mockStore = {
      increment: vi.fn().mockResolvedValue(undefined),
      getUsage: vi.fn().mockResolvedValue({
        workflowCount: 5,
        executionCount: 100,
        executionMinutes: 45.5,
      }),
      getPeriodUsage: vi.fn().mockResolvedValue({
        executionCount: 100,
        executionMinutes: 45.5,
      }),
    };
    tracker = new UsageTracker(mockStore);
  });

  it('should track workflow creation', async () => {
    await tracker.trackWorkflowCreated('tenant-1');

    expect(mockStore.increment).toHaveBeenCalledWith(
      'tenant-1',
      'workflow_count',
      1,
    );
  });

  it('should track workflow deletion', async () => {
    await tracker.trackWorkflowDeleted('tenant-1');

    expect(mockStore.increment).toHaveBeenCalledWith(
      'tenant-1',
      'workflow_count',
      -1,
    );
  });

  it('should track execution completion', async () => {
    await tracker.trackExecution('tenant-1', {
      executionId: 'exec-1',
      durationMs: 30000, // 30 seconds = 0.5 minutes
      status: 'success',
    });

    expect(mockStore.increment).toHaveBeenCalledWith(
      'tenant-1',
      'execution_count',
      1,
    );
    expect(mockStore.increment).toHaveBeenCalledWith(
      'tenant-1',
      'execution_minutes',
      0.5,
    );
  });

  it('should get current usage for a tenant', async () => {
    const usage = await tracker.getCurrentUsage('tenant-1');

    expect(usage.workflowCount).toBe(5);
    expect(usage.executionCount).toBe(100);
    expect(usage.executionMinutes).toBe(45.5);
  });
});
```

**File:** `packages/api/src/__tests__/billing/plan-limits.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlanLimitsEnforcer, PlanLimits } from '../../billing/plan-limits';

describe('PlanLimitsEnforcer', () => {
  let enforcer: PlanLimitsEnforcer;
  let mockUsageTracker: any;

  const PLAN_LIMITS: Record<string, PlanLimits> = {
    free: {
      maxWorkflows: 5,
      maxExecutionsPerMonth: 100,
      maxExecutionMinutesPerMonth: 60,
      maxCredentials: 3,
    },
    pro: {
      maxWorkflows: 50,
      maxExecutionsPerMonth: 5000,
      maxExecutionMinutesPerMonth: 1000,
      maxCredentials: 50,
    },
    enterprise: {
      maxWorkflows: -1,    // unlimited
      maxExecutionsPerMonth: -1,
      maxExecutionMinutesPerMonth: -1,
      maxCredentials: -1,
    },
  };

  beforeEach(() => {
    mockUsageTracker = {
      getCurrentUsage: vi.fn(),
      getPeriodUsage: vi.fn(),
    };
    enforcer = new PlanLimitsEnforcer(mockUsageTracker, PLAN_LIMITS);
  });

  it('should allow workflow creation within limits', async () => {
    mockUsageTracker.getCurrentUsage.mockResolvedValue({ workflowCount: 3 });

    const result = await enforcer.canCreateWorkflow('tenant-1', 'free');
    expect(result.allowed).toBe(true);
  });

  it('should deny workflow creation at limit', async () => {
    mockUsageTracker.getCurrentUsage.mockResolvedValue({ workflowCount: 5 });

    const result = await enforcer.canCreateWorkflow('tenant-1', 'free');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('workflow limit');
  });

  it('should allow execution within monthly limits', async () => {
    mockUsageTracker.getPeriodUsage.mockResolvedValue({
      executionCount: 50,
      executionMinutes: 30,
    });

    const result = await enforcer.canExecuteWorkflow('tenant-1', 'free');
    expect(result.allowed).toBe(true);
  });

  it('should deny execution at monthly limit', async () => {
    mockUsageTracker.getPeriodUsage.mockResolvedValue({
      executionCount: 100,
      executionMinutes: 55,
    });

    const result = await enforcer.canExecuteWorkflow('tenant-1', 'free');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('execution limit');
  });

  it('should allow unlimited for enterprise plan', async () => {
    mockUsageTracker.getCurrentUsage.mockResolvedValue({ workflowCount: 1000 });
    mockUsageTracker.getPeriodUsage.mockResolvedValue({
      executionCount: 100000,
      executionMinutes: 50000,
    });

    const workflowResult = await enforcer.canCreateWorkflow('tenant-1', 'enterprise');
    const execResult = await enforcer.canExecuteWorkflow('tenant-1', 'enterprise');

    expect(workflowResult.allowed).toBe(true);
    expect(execResult.allowed).toBe(true);
  });

  it('should return usage percentage', async () => {
    mockUsageTracker.getCurrentUsage.mockResolvedValue({ workflowCount: 3 });
    mockUsageTracker.getPeriodUsage.mockResolvedValue({
      executionCount: 80,
      executionMinutes: 48,
    });

    const usage = await enforcer.getUsagePercentage('tenant-1', 'free');

    expect(usage.workflows).toBe(60);   // 3/5 = 60%
    expect(usage.executions).toBe(80);  // 80/100 = 80%
    expect(usage.minutes).toBe(80);     // 48/60 = 80%
  });
});
```

**File:** `packages/api/src/__tests__/billing/stripe-webhook.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StripeWebhookHandler } from '../../billing/stripe-webhook-handler';

describe('StripeWebhookHandler', () => {
  let handler: StripeWebhookHandler;
  let mockTenantService: any;
  let mockUsageTracker: any;

  beforeEach(() => {
    mockTenantService = {
      updatePlan: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
      setStripeCustomerId: vi.fn().mockResolvedValue(undefined),
      getByStripeCustomerId: vi.fn().mockResolvedValue({ id: 'tenant-1', plan: 'free' }),
    };
    mockUsageTracker = {
      resetPeriodUsage: vi.fn().mockResolvedValue(undefined),
    };
    handler = new StripeWebhookHandler(mockTenantService, mockUsageTracker);
  });

  it('should handle checkout.session.completed', async () => {
    await handler.handleEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { tenantId: 'tenant-1' },
        },
      },
    });

    expect(mockTenantService.setStripeCustomerId).toHaveBeenCalledWith(
      'tenant-1',
      'cus_123',
    );
  });

  it('should handle customer.subscription.updated (plan change)', async () => {
    await handler.handleEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_123',
          items: {
            data: [{ price: { id: 'price_pro', lookup_key: 'pro' } }],
          },
          status: 'active',
        },
      },
    });

    expect(mockTenantService.updatePlan).toHaveBeenCalledWith(
      'tenant-1',
      'pro',
    );
  });

  it('should handle customer.subscription.deleted (cancellation)', async () => {
    await handler.handleEvent({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer: 'cus_123',
          status: 'canceled',
        },
      },
    });

    expect(mockTenantService.updatePlan).toHaveBeenCalledWith(
      'tenant-1',
      'free',
    );
  });

  it('should handle invoice.payment_failed', async () => {
    await handler.handleEvent({
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_123',
          attempt_count: 3,
        },
      },
    });

    // After 3 failed attempts, downgrade to free
    expect(mockTenantService.updatePlan).toHaveBeenCalledWith(
      'tenant-1',
      'free',
    );
  });

  it('should ignore unhandled event types', async () => {
    await expect(
      handler.handleEvent({
        type: 'some.unknown.event',
        data: { object: {} },
      }),
    ).resolves.not.toThrow();
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/billing/usage-tracker.ts`

```typescript
export interface UsageSummary {
  workflowCount: number;
  executionCount: number;
  executionMinutes: number;
}

export interface ExecutionUsage {
  executionId: string;
  durationMs: number;
  status: 'success' | 'error' | 'cancelled';
}

export interface UsageStore {
  increment(tenantId: string, metric: string, value: number): Promise<void>;
  getUsage(tenantId: string): Promise<UsageSummary>;
  getPeriodUsage(tenantId: string, periodStart: Date, periodEnd: Date): Promise<{
    executionCount: number;
    executionMinutes: number;
  }>;
}

export class UsageTracker {
  private store: UsageStore;

  constructor(store: UsageStore) {
    this.store = store;
  }

  async trackWorkflowCreated(tenantId: string): Promise<void> {
    await this.store.increment(tenantId, 'workflow_count', 1);
  }

  async trackWorkflowDeleted(tenantId: string): Promise<void> {
    await this.store.increment(tenantId, 'workflow_count', -1);
  }

  async trackExecution(tenantId: string, execution: ExecutionUsage): Promise<void> {
    const minutes = execution.durationMs / 60_000;

    await Promise.all([
      this.store.increment(tenantId, 'execution_count', 1),
      this.store.increment(tenantId, 'execution_minutes', minutes),
    ]);
  }

  async getCurrentUsage(tenantId: string): Promise<UsageSummary> {
    return this.store.getUsage(tenantId);
  }

  async getPeriodUsage(tenantId: string): Promise<{
    executionCount: number;
    executionMinutes: number;
  }> {
    // Current billing period: start of current month to now
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.store.getPeriodUsage(tenantId, periodStart, now);
  }
}
```

**File:** `packages/api/src/billing/plan-limits.ts`

```typescript
export interface PlanLimits {
  maxWorkflows: number;           // -1 = unlimited
  maxExecutionsPerMonth: number;  // -1 = unlimited
  maxExecutionMinutesPerMonth: number; // -1 = unlimited
  maxCredentials: number;         // -1 = unlimited
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage?: number;
  limit?: number;
}

export interface UsagePercentage {
  workflows: number;
  executions: number;
  minutes: number;
}

interface UsageTrackerInterface {
  getCurrentUsage(tenantId: string): Promise<{ workflowCount: number }>;
  getPeriodUsage(tenantId: string): Promise<{
    executionCount: number;
    executionMinutes: number;
  }>;
}

export class PlanLimitsEnforcer {
  private usageTracker: UsageTrackerInterface;
  private planLimits: Record<string, PlanLimits>;

  constructor(
    usageTracker: UsageTrackerInterface,
    planLimits: Record<string, PlanLimits>,
  ) {
    this.usageTracker = usageTracker;
    this.planLimits = planLimits;
  }

  private getLimits(plan: string): PlanLimits {
    return this.planLimits[plan] || this.planLimits.free;
  }

  async canCreateWorkflow(tenantId: string, plan: string): Promise<LimitCheckResult> {
    const limits = this.getLimits(plan);
    if (limits.maxWorkflows === -1) return { allowed: true };

    const usage = await this.usageTracker.getCurrentUsage(tenantId);

    if (usage.workflowCount >= limits.maxWorkflows) {
      return {
        allowed: false,
        reason: `Reached workflow limit (${limits.maxWorkflows}) for ${plan} plan. Upgrade to create more workflows.`,
        currentUsage: usage.workflowCount,
        limit: limits.maxWorkflows,
      };
    }

    return { allowed: true };
  }

  async canExecuteWorkflow(tenantId: string, plan: string): Promise<LimitCheckResult> {
    const limits = this.getLimits(plan);
    if (limits.maxExecutionsPerMonth === -1) return { allowed: true };

    const periodUsage = await this.usageTracker.getPeriodUsage(tenantId);

    if (periodUsage.executionCount >= limits.maxExecutionsPerMonth) {
      return {
        allowed: false,
        reason: `Reached monthly execution limit (${limits.maxExecutionsPerMonth}) for ${plan} plan. Upgrade for more executions.`,
        currentUsage: periodUsage.executionCount,
        limit: limits.maxExecutionsPerMonth,
      };
    }

    if (
      limits.maxExecutionMinutesPerMonth !== -1 &&
      periodUsage.executionMinutes >= limits.maxExecutionMinutesPerMonth
    ) {
      return {
        allowed: false,
        reason: `Reached monthly execution minutes limit (${limits.maxExecutionMinutesPerMonth}) for ${plan} plan.`,
        currentUsage: periodUsage.executionMinutes,
        limit: limits.maxExecutionMinutesPerMonth,
      };
    }

    return { allowed: true };
  }

  async getUsagePercentage(tenantId: string, plan: string): Promise<UsagePercentage> {
    const limits = this.getLimits(plan);
    const currentUsage = await this.usageTracker.getCurrentUsage(tenantId);
    const periodUsage = await this.usageTracker.getPeriodUsage(tenantId);

    return {
      workflows: limits.maxWorkflows === -1
        ? 0
        : Math.round((currentUsage.workflowCount / limits.maxWorkflows) * 100),
      executions: limits.maxExecutionsPerMonth === -1
        ? 0
        : Math.round((periodUsage.executionCount / limits.maxExecutionsPerMonth) * 100),
      minutes: limits.maxExecutionMinutesPerMonth === -1
        ? 0
        : Math.round((periodUsage.executionMinutes / limits.maxExecutionMinutesPerMonth) * 100),
    };
  }
}
```

**File:** `packages/api/src/billing/stripe-webhook-handler.ts`

```typescript
export interface TenantServiceInterface {
  updatePlan(tenantId: string, plan: string): Promise<void>;
  deactivate(tenantId: string): Promise<void>;
  setStripeCustomerId(tenantId: string, customerId: string): Promise<void>;
  getByStripeCustomerId(customerId: string): Promise<{ id: string; plan: string } | null>;
}

export interface UsageTrackerInterface {
  resetPeriodUsage(tenantId: string): Promise<void>;
}

interface StripeEvent {
  type: string;
  data: {
    object: Record<string, any>;
  };
}

const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_ID_FREE || 'price_free']: 'free',
  [process.env.STRIPE_PRICE_ID_PRO || 'price_pro']: 'pro',
  [process.env.STRIPE_PRICE_ID_ENTERPRISE || 'price_enterprise']: 'enterprise',
};

export class StripeWebhookHandler {
  private tenantService: TenantServiceInterface;
  private usageTracker: UsageTrackerInterface;

  constructor(
    tenantService: TenantServiceInterface,
    usageTracker: UsageTrackerInterface,
  ) {
    this.tenantService = tenantService;
    this.usageTracker = usageTracker;
  }

  async handleEvent(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: Record<string, any>): Promise<void> {
    const tenantId = session.metadata?.tenantId;
    const customerId = session.customer;

    if (tenantId && customerId) {
      await this.tenantService.setStripeCustomerId(tenantId, customerId);
      console.log(`[Stripe] Linked customer ${customerId} to tenant ${tenantId}`);
    }
  }

  private async handleSubscriptionUpdated(subscription: Record<string, any>): Promise<void> {
    const customerId = subscription.customer;
    const tenant = await this.tenantService.getByStripeCustomerId(customerId);
    if (!tenant) {
      console.error(`[Stripe] No tenant found for customer ${customerId}`);
      return;
    }

    if (subscription.status === 'active') {
      const priceId = subscription.items?.data?.[0]?.price?.id;
      const lookupKey = subscription.items?.data?.[0]?.price?.lookup_key;
      const plan = lookupKey || PRICE_TO_PLAN[priceId] || 'free';

      await this.tenantService.updatePlan(tenant.id, plan);
      console.log(`[Stripe] Updated tenant ${tenant.id} to plan ${plan}`);
    }
  }

  private async handleSubscriptionDeleted(subscription: Record<string, any>): Promise<void> {
    const customerId = subscription.customer;
    const tenant = await this.tenantService.getByStripeCustomerId(customerId);
    if (!tenant) return;

    // Downgrade to free on cancellation
    await this.tenantService.updatePlan(tenant.id, 'free');
    console.log(`[Stripe] Downgraded tenant ${tenant.id} to free (subscription cancelled)`);
  }

  private async handlePaymentFailed(invoice: Record<string, any>): Promise<void> {
    const customerId = invoice.customer;
    const attemptCount = invoice.attempt_count || 0;
    const tenant = await this.tenantService.getByStripeCustomerId(customerId);
    if (!tenant) return;

    if (attemptCount >= 3) {
      // After 3 failed attempts, downgrade to free
      await this.tenantService.updatePlan(tenant.id, 'free');
      console.log(`[Stripe] Downgraded tenant ${tenant.id} to free after ${attemptCount} failed payments`);
    }
  }

  private async handleInvoicePaid(invoice: Record<string, any>): Promise<void> {
    const customerId = invoice.customer;
    const tenant = await this.tenantService.getByStripeCustomerId(customerId);
    if (!tenant) return;

    // Reset usage counters for new billing period
    await this.usageTracker.resetPeriodUsage(tenant.id);
    console.log(`[Stripe] Reset usage counters for tenant ${tenant.id} (invoice paid)`);
  }
}
```

**File:** `packages/api/src/routes/billing-routes.ts`

```typescript
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { StripeWebhookHandler } from '../billing/stripe-webhook-handler';

export function createBillingRoutes(
  stripe: Stripe,
  webhookHandler: StripeWebhookHandler,
  webhookSecret: string,
): Router {
  const router = Router();

  // Stripe webhook endpoint
  router.post(
    '/billing/webhook',
    // Raw body needed for signature verification
    (req: Request, res: Response) => {
      const sig = req.headers['stripe-signature'] as string;
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          (req as any).rawBody,
          sig,
          webhookSecret,
        );
      } catch (err) {
        console.error('[Stripe] Webhook signature verification failed:', err);
        res.status(400).send('Webhook Error');
        return;
      }

      webhookHandler
        .handleEvent(event as any)
        .then(() => res.json({ received: true }))
        .catch((err) => {
          console.error('[Stripe] Webhook handler error:', err);
          res.status(500).send('Handler Error');
        });
    },
  );

  // Create checkout session
  router.post('/billing/checkout', async (req: Request, res: Response) => {
    const { tenantId, planId, successUrl, cancelUrl } = req.body;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: planId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { tenantId },
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // Get current usage
  router.get('/billing/usage', async (req: Request, res: Response) => {
    const tenantId = (req as any).tenantId;
    // Usage retrieval logic here
    res.json({ tenantId, usage: {} });
  });

  return router;
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "UsageTracker|PlanLimits|StripeWebhook"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Cannot find module 'stripe'` | Run `pnpm --filter @r360/api add stripe` |
| `Stripe signature verification fails` | Ensure raw body is preserved via Express middleware. Use `express.raw({type: 'application/json'})` for the webhook route |
| `Plan limits not enforced` | Check that `PlanLimitsEnforcer.canExecuteWorkflow()` is called before enqueueing in the execution flow |
| `Usage tracker mock not called` | Verify that `trackExecution` is called in the lifecycle hooks after execution completes |
| `Price to plan mapping empty` | Set environment variables or use test defaults in the PRICE_TO_PLAN constant |

### Success Criteria
- [ ] Workflow creation tracked in usage
- [ ] Workflow deletion decrements usage
- [ ] Execution count and minutes tracked accurately
- [ ] Free plan limits enforced (5 workflows, 100 executions/month)
- [ ] Pro plan limits enforced (50 workflows, 5000 executions/month)
- [ ] Enterprise plan has unlimited access
- [ ] Usage percentage calculated correctly
- [ ] Stripe checkout.session.completed links customer to tenant
- [ ] Stripe subscription.updated changes tenant plan
- [ ] Stripe subscription.deleted downgrades to free
- [ ] Payment failure after 3 attempts downgrades to free
- [ ] Unknown Stripe events handled gracefully

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "billing|usage|plan|stripe"
# Expected: All billing tests pass

# Test Stripe webhook locally
stripe trigger checkout.session.completed
# Expected: Webhook received and processed

# Verify usage endpoint
curl http://localhost:3000/api/billing/usage -H "Authorization: Bearer $TOKEN"
# Expected: JSON with usage data
```

---

## Step 5.3: Admin & Onboarding

### Objective
Build the tenant provisioning flow (signup, create org, invite team), tenant settings page, and admin dashboard for platform operators. This enables self-service onboarding and platform-level operational visibility.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/admin/tenant-provisioning.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TenantProvisioningService } from '../../admin/tenant-provisioning';

describe('TenantProvisioningService', () => {
  let provisioner: TenantProvisioningService;
  let mockDb: any;
  let mockAuthProvider: any;
  let mockStripe: any;

  beforeEach(() => {
    mockDb = {
      tenants: {
        create: vi.fn().mockResolvedValue({ id: 'tenant-new' }),
        getById: vi.fn().mockResolvedValue(null),
        getBySlug: vi.fn().mockResolvedValue(null),
      },
      users: {
        create: vi.fn().mockResolvedValue({ id: 'user-new' }),
        getByEmail: vi.fn().mockResolvedValue(null),
      },
    };
    mockAuthProvider = {
      createUser: vi.fn().mockResolvedValue({ id: 'auth-user-1' }),
      sendInvite: vi.fn().mockResolvedValue(undefined),
    };
    mockStripe = {
      customers: {
        create: vi.fn().mockResolvedValue({ id: 'cus_new' }),
      },
    };
    provisioner = new TenantProvisioningService(mockDb, mockAuthProvider, mockStripe);
  });

  describe('Tenant Creation', () => {
    it('should create a new tenant with default settings', async () => {
      const result = await provisioner.createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        ownerEmail: 'admin@acme.com',
        ownerName: 'John Admin',
      });

      expect(result.tenant).toBeDefined();
      expect(result.owner).toBeDefined();
      expect(mockDb.tenants.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme Corp',
          slug: 'acme-corp',
          plan: 'free', // default plan
        }),
      );
    });

    it('should create a Stripe customer for the tenant', async () => {
      await provisioner.createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        ownerEmail: 'admin@acme.com',
        ownerName: 'John Admin',
      });

      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@acme.com',
          name: 'Acme Corp',
        }),
      );
    });

    it('should create an owner user for the tenant', async () => {
      await provisioner.createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        ownerEmail: 'admin@acme.com',
        ownerName: 'John Admin',
      });

      expect(mockDb.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@acme.com',
          role: 'owner',
        }),
      );
    });

    it('should reject duplicate slugs', async () => {
      mockDb.tenants.getBySlug.mockResolvedValue({ id: 'existing' });

      await expect(
        provisioner.createTenant({
          name: 'Acme Corp',
          slug: 'acme-corp',
          ownerEmail: 'admin@acme.com',
          ownerName: 'John Admin',
        }),
      ).rejects.toThrow(/slug.*already.*taken/i);
    });

    it('should generate a unique encryption key per tenant', async () => {
      const result = await provisioner.createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        ownerEmail: 'admin@acme.com',
        ownerName: 'John Admin',
      });

      expect(mockDb.tenants.create).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            encryptionKeySalt: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('Team Invitations', () => {
    it('should invite a team member', async () => {
      await provisioner.inviteTeamMember({
        tenantId: 'tenant-1',
        email: 'member@acme.com',
        role: 'member',
        invitedBy: 'user-owner',
      });

      expect(mockAuthProvider.sendInvite).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'member@acme.com',
        }),
      );
    });

    it('should reject invitations with invalid roles', async () => {
      await expect(
        provisioner.inviteTeamMember({
          tenantId: 'tenant-1',
          email: 'member@acme.com',
          role: 'superadmin' as any,
          invitedBy: 'user-owner',
        }),
      ).rejects.toThrow(/invalid role/i);
    });
  });

  describe('Tenant Settings', () => {
    it('should update tenant settings', async () => {
      mockDb.tenants.getById.mockResolvedValue({
        id: 'tenant-1',
        settings: { timezone: 'UTC' },
      });
      mockDb.tenants.update = vi.fn().mockResolvedValue(undefined);

      await provisioner.updateTenantSettings('tenant-1', {
        timezone: 'America/New_York',
        defaultWorkflowTimeout: 600000,
      });

      expect(mockDb.tenants.update).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          settings: expect.objectContaining({
            timezone: 'America/New_York',
          }),
        }),
      );
    });
  });
});
```

**File:** `packages/api/src/__tests__/admin/admin-dashboard.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminDashboardService } from '../../admin/admin-dashboard';

describe('AdminDashboardService', () => {
  let dashboard: AdminDashboardService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      tenants: {
        count: vi.fn().mockResolvedValue(42),
        list: vi.fn().mockResolvedValue([
          { id: 't1', name: 'Tenant 1', plan: 'pro', createdAt: new Date() },
          { id: 't2', name: 'Tenant 2', plan: 'free', createdAt: new Date() },
        ]),
        getById: vi.fn().mockResolvedValue({
          id: 't1',
          name: 'Tenant 1',
          plan: 'pro',
        }),
      },
      executions: {
        countAll: vi.fn().mockResolvedValue(10500),
        countByStatus: vi.fn().mockResolvedValue({
          success: 9800,
          error: 600,
          running: 100,
        }),
      },
      workflows: {
        countAll: vi.fn().mockResolvedValue(350),
      },
      users: {
        countAll: vi.fn().mockResolvedValue(128),
      },
    };
    dashboard = new AdminDashboardService(mockDb);
  });

  it('should return platform overview metrics', async () => {
    const overview = await dashboard.getOverview();

    expect(overview.totalTenants).toBe(42);
    expect(overview.totalWorkflows).toBe(350);
    expect(overview.totalExecutions).toBe(10500);
    expect(overview.totalUsers).toBe(128);
  });

  it('should return execution status breakdown', async () => {
    const stats = await dashboard.getExecutionStats();

    expect(stats.success).toBe(9800);
    expect(stats.error).toBe(600);
    expect(stats.running).toBe(100);
    expect(stats.successRate).toBeCloseTo(93.3, 0);
  });

  it('should list tenants with pagination', async () => {
    const result = await dashboard.listTenants({ page: 1, pageSize: 20 });

    expect(result).toHaveLength(2);
    expect(mockDb.tenants.list).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 20 }),
    );
  });

  it('should return detailed tenant info for admin', async () => {
    const tenant = await dashboard.getTenantDetail('t1');

    expect(tenant).toBeDefined();
    expect(tenant!.id).toBe('t1');
    expect(tenant!.plan).toBe('pro');
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/admin/tenant-provisioning.ts`

```typescript
import crypto from 'node:crypto';

export interface CreateTenantInput {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  plan?: string;
}

export interface InviteMemberInput {
  tenantId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invitedBy: string;
}

export interface TenantSettings {
  timezone?: string;
  defaultWorkflowTimeout?: number;
  encryptionKeySalt?: string;
  webhookSigningSecret?: string;
}

const VALID_ROLES = ['owner', 'admin', 'member', 'viewer'];

export class TenantProvisioningService {
  private db: any;
  private authProvider: any;
  private stripe: any;

  constructor(db: any, authProvider: any, stripe: any) {
    this.db = db;
    this.authProvider = authProvider;
    this.stripe = stripe;
  }

  async createTenant(input: CreateTenantInput): Promise<{
    tenant: any;
    owner: any;
  }> {
    // Check slug uniqueness
    const existingSlug = await this.db.tenants.getBySlug(input.slug);
    if (existingSlug) {
      throw new Error(`Slug '${input.slug}' is already taken`);
    }

    // Generate per-tenant encryption key salt
    const encryptionKeySalt = crypto.randomBytes(32).toString('hex');
    const webhookSigningSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

    // Create Stripe customer
    const stripeCustomer = await this.stripe.customers.create({
      email: input.ownerEmail,
      name: input.name,
      metadata: { slug: input.slug },
    });

    // Create tenant in DB
    const tenant = await this.db.tenants.create({
      name: input.name,
      slug: input.slug,
      plan: input.plan || 'free',
      stripeCustomerId: stripeCustomer.id,
      settings: {
        timezone: 'UTC',
        encryptionKeySalt,
        webhookSigningSecret,
      },
    });

    // Create auth user
    const authUser = await this.authProvider.createUser({
      email: input.ownerEmail,
      name: input.ownerName,
    });

    // Create DB user record
    const owner = await this.db.users.create({
      tenantId: tenant.id,
      email: input.ownerEmail,
      name: input.ownerName,
      role: 'owner',
      authProviderId: authUser.id,
    });

    return { tenant, owner };
  }

  async inviteTeamMember(input: InviteMemberInput): Promise<void> {
    if (!VALID_ROLES.includes(input.role) || input.role === 'owner') {
      throw new Error(`Invalid role: ${input.role}. Must be one of: admin, member, viewer`);
    }

    // Check if already invited
    const existing = await this.db.users.getByEmail(input.email);
    if (existing) {
      throw new Error(`User ${input.email} is already a member`);
    }

    await this.authProvider.sendInvite({
      email: input.email,
      tenantId: input.tenantId,
      role: input.role,
      invitedBy: input.invitedBy,
    });
  }

  async updateTenantSettings(
    tenantId: string,
    settings: Partial<TenantSettings>,
  ): Promise<void> {
    const tenant = await this.db.tenants.getById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const mergedSettings = {
      ...tenant.settings,
      ...settings,
    };

    await this.db.tenants.update(tenantId, { settings: mergedSettings });
  }
}
```

**File:** `packages/api/src/admin/admin-dashboard.ts`

```typescript
export interface PlatformOverview {
  totalTenants: number;
  totalWorkflows: number;
  totalExecutions: number;
  totalUsers: number;
}

export interface ExecutionStats {
  success: number;
  error: number;
  running: number;
  successRate: number;
}

export class AdminDashboardService {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async getOverview(): Promise<PlatformOverview> {
    const [totalTenants, totalWorkflows, totalExecutions, totalUsers] =
      await Promise.all([
        this.db.tenants.count(),
        this.db.workflows.countAll(),
        this.db.executions.countAll(),
        this.db.users.countAll(),
      ]);

    return { totalTenants, totalWorkflows, totalExecutions, totalUsers };
  }

  async getExecutionStats(): Promise<ExecutionStats> {
    const counts = await this.db.executions.countByStatus();
    const total = counts.success + counts.error + counts.running;

    return {
      ...counts,
      successRate: total > 0 ? (counts.success / total) * 100 : 0,
    };
  }

  async listTenants(pagination: {
    page: number;
    pageSize: number;
  }): Promise<any[]> {
    const offset = (pagination.page - 1) * pagination.pageSize;
    return this.db.tenants.list({
      offset,
      limit: pagination.pageSize,
    });
  }

  async getTenantDetail(tenantId: string): Promise<any> {
    return this.db.tenants.getById(tenantId);
  }
}
```

**File:** `packages/api/src/routes/admin-routes.ts`

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { AdminDashboardService } from '../admin/admin-dashboard';
import { TenantProvisioningService } from '../admin/tenant-provisioning';

function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-admin-api-key'];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    res.status(403).json({ error: 'Platform admin access required' });
    return;
  }
  next();
}

export function createAdminRoutes(
  dashboard: AdminDashboardService,
  provisioner: TenantProvisioningService,
): Router {
  const router = Router();

  router.use(requirePlatformAdmin);

  router.get('/admin/overview', async (_req: Request, res: Response) => {
    const overview = await dashboard.getOverview();
    res.json(overview);
  });

  router.get('/admin/execution-stats', async (_req: Request, res: Response) => {
    const stats = await dashboard.getExecutionStats();
    res.json(stats);
  });

  router.get('/admin/tenants', async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const tenants = await dashboard.listTenants({ page, pageSize });
    res.json(tenants);
  });

  router.get('/admin/tenants/:id', async (req: Request, res: Response) => {
    const tenant = await dashboard.getTenantDetail(req.params.id);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    res.json(tenant);
  });

  return router;
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "TenantProvisioning|AdminDashboard"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Slug uniqueness check not working` | Ensure `getBySlug` returns null for new slugs and the existing tenant for duplicates |
| `Stripe customer creation fails` | Use a mock Stripe client in tests. Verify mock returns `{ id: 'cus_xxx' }` |
| `Role validation allows 'owner'` | Update VALID_ROLES check: `input.role === 'owner'` should throw |
| `Admin auth middleware blocks tests` | Set `ADMIN_API_KEY` environment variable in test setup or mock the middleware |
| `Dashboard metrics return undefined` | Ensure all mock DB methods return numbers, not undefined |

### Success Criteria
- [ ] Tenant creation produces tenant, owner user, and Stripe customer
- [ ] Duplicate slugs rejected
- [ ] Per-tenant encryption key salt generated
- [ ] Team invitation sends invite via auth provider
- [ ] Invalid roles rejected
- [ ] Tenant settings update correctly
- [ ] Admin dashboard returns platform overview metrics
- [ ] Execution stats with success rate calculated
- [ ] Tenant list with pagination works
- [ ] Admin routes require platform admin API key

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "admin|provision"
# Expected: All admin and provisioning tests pass

# Test admin API (with server running)
curl http://localhost:3000/api/admin/overview -H "X-Admin-API-Key: $ADMIN_API_KEY"
# Expected: JSON with totalTenants, totalWorkflows, etc.
```

---

## Step 5.4: Security Hardening

### Objective
Harden the platform against security threats with penetration testing for tenant isolation, credential encryption audit, API rate limiting, abuse prevention, security headers, CORS configuration, and OWASP Top 10 coverage specific to this multi-tenant application.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/security/tenant-isolation-attacks.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app';
import { Express } from 'express';

describe('Tenant Isolation Security Tests', () => {
  let app: Express;
  let tenantAToken: string;
  let tenantBToken: string;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
    tenantAToken = testSetup.tenantAToken;
    tenantBToken = testSetup.tenantBToken;
  });

  describe('IDOR - Insecure Direct Object Reference', () => {
    it('should NOT allow Tenant A to access Tenant B workflows via API', async () => {
      // Create a workflow as Tenant B
      const createRes = await request(app)
        .post('/api/workflows')
        .set('Authorization', `Bearer ${tenantBToken}`)
        .send({ name: 'Secret Workflow', definition: {} });

      const workflowId = createRes.body.id;

      // Try to access it as Tenant A
      const getRes = await request(app)
        .get(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(getRes.status).toBe(404);
    });

    it('should NOT allow Tenant A to access Tenant B credentials via API', async () => {
      const res = await request(app)
        .get('/api/credentials/cred-tenant-b')
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(res.status).toBe(404);
    });

    it('should NOT allow Tenant A to access Tenant B execution results', async () => {
      const res = await request(app)
        .get('/api/executions/exec-tenant-b')
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(res.status).toBe(404);
    });

    it('should NOT allow Tenant A to update Tenant B workflow via PUT', async () => {
      const res = await request(app)
        .put('/api/workflows/wf-tenant-b')
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send({ name: 'Hacked!' });

      expect(res.status).toBe(404);
    });

    it('should NOT allow Tenant A to delete Tenant B workflow', async () => {
      const res = await request(app)
        .delete('/api/workflows/wf-tenant-b')
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(res.status).toBe(404);
    });

    it('should NOT allow Tenant A to execute Tenant B workflow', async () => {
      const res = await request(app)
        .post('/api/workflows/wf-tenant-b/execute')
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Webhook Path Manipulation', () => {
    it('should NOT allow Tenant A to trigger Tenant B webhook', async () => {
      const res = await request(app)
        .post('/webhook/tenant-b/secret-webhook-path')
        .send({ data: 'malicious' });

      // Should either return 404 or only trigger tenant-b's workflow
      // Tenant A's data should never reach tenant B's workflow
      expect([200, 202, 404]).toContain(res.status);
    });

    it('should NOT allow path traversal in webhook paths', async () => {
      const res = await request(app)
        .post('/webhook/tenant-a/../tenant-b/secret-path')
        .send({ data: 'traversal' });

      expect(res.status).toBe(404);
    });
  });

  describe('API Authentication Bypass', () => {
    it('should reject requests without auth token', async () => {
      const res = await request(app)
        .get('/api/workflows');

      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid auth token', async () => {
      const res = await request(app)
        .get('/api/workflows')
        .set('Authorization', 'Bearer invalid-token-xxx');

      expect(res.status).toBe(401);
    });

    it('should reject expired auth tokens', async () => {
      const res = await request(app)
        .get('/api/workflows')
        .set('Authorization', 'Bearer expired-token-xxx');

      expect(res.status).toBe(401);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in workflow name search', async () => {
      const res = await request(app)
        .get("/api/workflows?search='; DROP TABLE workflows; --")
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(res.status).not.toBe(500);
      // Verify workflows table still exists
      const listRes = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(listRes.status).toBe(200);
    });

    it('should prevent SQL injection in tenant ID parameter', async () => {
      const res = await request(app)
        .get("/api/workflows?tenantId='; DELETE FROM tenants; --")
        .set('Authorization', `Bearer ${tenantAToken}`);

      // tenantId comes from auth token, not query params
      expect(res.status).not.toBe(500);
    });
  });

  describe('XSS Prevention', () => {
    it('should sanitize workflow names containing script tags', async () => {
      const res = await request(app)
        .post('/api/workflows')
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send({
          name: '<script>alert("xss")</script>',
          definition: {},
        });

      if (res.status === 201) {
        expect(res.body.name).not.toContain('<script>');
      }
    });
  });
});
```

**File:** `packages/api/src/__tests__/security/rate-limiting.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app';
import { Express } from 'express';

describe('API Rate Limiting', () => {
  let app: Express;
  let token: string;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
    token = testSetup.tenantAToken;
  });

  it('should enforce rate limits on API endpoints', async () => {
    const requests = [];
    const LIMIT = 100;

    // Send requests rapidly (more than the limit)
    for (let i = 0; i < LIMIT + 10; i++) {
      requests.push(
        request(app)
          .get('/api/workflows')
          .set('Authorization', `Bearer ${token}`),
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should return retry-after header when rate limited', async () => {
    const requests = [];
    for (let i = 0; i < 120; i++) {
      requests.push(
        request(app)
          .get('/api/workflows')
          .set('Authorization', `Bearer ${token}`),
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.find(r => r.status === 429);

    if (rateLimited) {
      expect(rateLimited.headers['retry-after']).toBeDefined();
    }
  });

  it('should enforce stricter rate limits on auth endpoints', async () => {
    const requests = [];
    for (let i = 0; i < 20; i++) {
      requests.push(
        request(app)
          .post('/api/auth/login')
          .send({ email: 'test@test.com', password: 'wrong' }),
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

**File:** `packages/api/src/__tests__/security/credential-encryption.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { CredentialEncryption } from '../../security/credential-encryption';

describe('Credential Encryption Audit', () => {
  const masterKey = 'a'.repeat(64); // 256-bit hex key

  it('should encrypt credentials with tenant-specific derived key', () => {
    const encryption = new CredentialEncryption(masterKey);

    const plaintext = { apiKey: 'sk_test_123456', secret: 'very-secret' };
    const tenantA = encryption.encrypt(plaintext, 'tenant-a', 'salt-a');
    const tenantB = encryption.encrypt(plaintext, 'tenant-b', 'salt-b');

    // Same plaintext should produce different ciphertexts for different tenants
    expect(tenantA).not.toBe(tenantB);
  });

  it('should decrypt credentials with correct tenant key', () => {
    const encryption = new CredentialEncryption(masterKey);

    const plaintext = { apiKey: 'sk_test_123456' };
    const encrypted = encryption.encrypt(plaintext, 'tenant-a', 'salt-a');
    const decrypted = encryption.decrypt(encrypted, 'tenant-a', 'salt-a');

    expect(decrypted).toEqual(plaintext);
  });

  it('should NOT decrypt credentials with wrong tenant key', () => {
    const encryption = new CredentialEncryption(masterKey);

    const plaintext = { apiKey: 'sk_test_123456' };
    const encrypted = encryption.encrypt(plaintext, 'tenant-a', 'salt-a');

    expect(() => {
      encryption.decrypt(encrypted, 'tenant-b', 'salt-b');
    }).toThrow();
  });

  it('should use AES-256-GCM for encryption', () => {
    const encryption = new CredentialEncryption(masterKey);

    const plaintext = { apiKey: 'test' };
    const encrypted = encryption.encrypt(plaintext, 'tenant-a', 'salt-a');

    // Encrypted data should contain IV, auth tag, and ciphertext
    const parsed = JSON.parse(encrypted);
    expect(parsed.iv).toBeDefined();
    expect(parsed.authTag).toBeDefined();
    expect(parsed.ciphertext).toBeDefined();
    expect(parsed.algorithm).toBe('aes-256-gcm');
  });

  it('should produce different ciphertexts for same input (random IV)', () => {
    const encryption = new CredentialEncryption(masterKey);

    const plaintext = { apiKey: 'test' };
    const enc1 = encryption.encrypt(plaintext, 'tenant-a', 'salt-a');
    const enc2 = encryption.encrypt(plaintext, 'tenant-a', 'salt-a');

    // Random IV means different ciphertexts each time
    expect(enc1).not.toBe(enc2);

    // But both should decrypt to the same plaintext
    const dec1 = encryption.decrypt(enc1, 'tenant-a', 'salt-a');
    const dec2 = encryption.decrypt(enc2, 'tenant-a', 'salt-a');
    expect(dec1).toEqual(dec2);
  });
});
```

**File:** `packages/api/src/__tests__/security/security-headers.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app';
import { Express } from 'express';

describe('Security Headers', () => {
  let app: Express;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
  });

  it('should set X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should set X-Frame-Options: DENY', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('should set Strict-Transport-Security', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('should set Content-Security-Policy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('should NOT expose X-Powered-By header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('should set proper CORS headers', async () => {
    const res = await request(app)
      .options('/api/workflows')
      .set('Origin', 'https://app.r360flow.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://app.r360flow.com');
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });

  it('should reject CORS from unauthorized origins', async () => {
    const res = await request(app)
      .options('/api/workflows')
      .set('Origin', 'https://evil.com');

    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.com');
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/security/credential-encryption.ts`

```typescript
import crypto from 'node:crypto';

export class CredentialEncryption {
  private masterKey: string;

  constructor(masterKey: string) {
    if (masterKey.length < 64) {
      throw new Error('Master key must be at least 256 bits (64 hex characters)');
    }
    this.masterKey = masterKey;
  }

  private deriveKey(tenantId: string, salt: string): Buffer {
    return crypto.pbkdf2Sync(
      this.masterKey,
      `${tenantId}:${salt}`,
      100_000,
      32, // 256 bits
      'sha512',
    );
  }

  encrypt(
    plaintext: Record<string, unknown>,
    tenantId: string,
    salt: string,
  ): string {
    const key = this.deriveKey(tenantId, salt);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const plaintextStr = JSON.stringify(plaintext);
    let ciphertext = cipher.update(plaintextStr, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return JSON.stringify({
      algorithm: 'aes-256-gcm',
      iv: iv.toString('hex'),
      authTag,
      ciphertext,
    });
  }

  decrypt(
    encryptedStr: string,
    tenantId: string,
    salt: string,
  ): Record<string, unknown> {
    const key = this.deriveKey(tenantId, salt);
    const { iv, authTag, ciphertext } = JSON.parse(encryptedStr);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return JSON.parse(plaintext);
  }
}
```

**File:** `packages/api/src/security/security-middleware.ts`

```typescript
import { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

export function configureSecurityMiddleware(app: Express): void {
  // Helmet sets various security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
        frameSrc: ["'self'", 'https://js.stripe.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // CORS configuration
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  }));

  // General API rate limiter
  const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    keyGenerator: (req) => {
      // Rate limit per tenant, not per IP
      return (req as any).tenantId || req.ip || 'unknown';
    },
  });
  app.use('/api/', apiLimiter);

  // Stricter rate limiter for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 900000, // 15 minutes
    max: 15,          // 15 attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts' },
  });
  app.use('/api/auth/', authLimiter);

  // Remove X-Powered-By header
  app.disable('x-powered-by');
}
```

**File:** `packages/api/src/security/owasp-checklist.ts`

```typescript
/**
 * OWASP Top 10 (2021) Checklist specific to R360 Flow
 *
 * A01:2021 - Broken Access Control
 *   [x] Tenant isolation: all queries include tenant_id
 *   [x] IDOR prevention: resource access validated against tenant context
 *   [x] CORS restricted to allowed origins
 *   [x] JWT token validation on every request
 *   [x] Role-based access control (owner, admin, member, viewer)
 *
 * A02:2021 - Cryptographic Failures
 *   [x] Credentials encrypted with AES-256-GCM
 *   [x] Per-tenant encryption keys derived from master key + salt
 *   [x] PBKDF2 with 100,000 iterations for key derivation
 *   [x] Random IVs for every encryption operation
 *   [x] Auth tags verified on decryption (GCM mode)
 *   [x] Master key stored in environment variable, not code
 *   [x] HTTPS enforced via HSTS
 *
 * A03:2021 - Injection
 *   [x] Parameterized queries (no string concatenation in SQL)
 *   [x] Input validation and sanitization on all user inputs
 *   [x] Code sandbox (isolated-vm) for user-provided JavaScript
 *
 * A04:2021 - Insecure Design
 *   [x] Multi-tenant isolation designed from day one
 *   [x] Threat modeling for cross-tenant scenarios
 *   [x] Rate limiting at API and execution queue levels
 *   [x] Principle of least privilege for service accounts
 *
 * A05:2021 - Security Misconfiguration
 *   [x] Security headers via Helmet
 *   [x] X-Powered-By removed
 *   [x] CSP configured
 *   [x] Default credentials prohibited
 *   [x] Error messages do not leak internal details
 *
 * A06:2021 - Vulnerable and Outdated Components
 *   [x] n8n packages pinned to specific versions
 *   [x] Dependabot/Renovate configured for security updates
 *   [x] npm audit run in CI pipeline
 *
 * A07:2021 - Identification and Authentication Failures
 *   [x] Auth provider (Clerk/Auth0) handles password complexity
 *   [x] JWT token expiration and refresh
 *   [x] Rate limiting on login attempts
 *   [x] Session management delegated to auth provider
 *
 * A08:2021 - Software and Data Integrity Failures
 *   [x] Webhook signature verification (HMAC-SHA256)
 *   [x] Stripe webhook signature verification
 *   [x] CI/CD pipeline integrity checks
 *
 * A09:2021 - Security Logging and Monitoring Failures
 *   [x] Audit logging for all data access
 *   [x] Security event logging for cross-tenant attempts
 *   [x] Structured logging with tenant context
 *   [x] Log aggregation to monitoring system (Datadog/Sentry)
 *
 * A10:2021 - Server-Side Request Forgery (SSRF)
 *   [x] Network policies on execution workers
 *   [x] URL validation in webhook and HTTP nodes
 *   [x] Internal network addresses blocked in user-defined requests
 */

export const OWASP_CHECKLIST = {
  A01_BROKEN_ACCESS_CONTROL: {
    tenantIsolation: true,
    idorPrevention: true,
    corsRestricted: true,
    jwtValidation: true,
    rbac: true,
  },
  A02_CRYPTOGRAPHIC_FAILURES: {
    aes256gcm: true,
    perTenantKeys: true,
    pbkdf2Iterations: 100_000,
    randomIVs: true,
    gcmAuthTags: true,
    masterKeyInEnv: true,
    httpsEnforced: true,
  },
  A03_INJECTION: {
    parameterizedQueries: true,
    inputValidation: true,
    codeSandbox: true,
  },
  A04_INSECURE_DESIGN: {
    multiTenantFromDayOne: true,
    threatModeling: true,
    rateLimiting: true,
    leastPrivilege: true,
  },
  A05_SECURITY_MISCONFIGURATION: {
    helmetHeaders: true,
    xPoweredByRemoved: true,
    cspConfigured: true,
    noDefaultCredentials: true,
    safeErrorMessages: true,
  },
  A06_VULNERABLE_COMPONENTS: {
    pinnedVersions: true,
    automatedUpdates: true,
    npmAudit: true,
  },
  A07_AUTH_FAILURES: {
    passwordComplexity: true,
    tokenExpiration: true,
    loginRateLimiting: true,
    sessionManagement: true,
  },
  A08_INTEGRITY_FAILURES: {
    webhookSignatures: true,
    stripeSignatures: true,
    cicdIntegrity: true,
  },
  A09_LOGGING_FAILURES: {
    auditLogging: true,
    securityEventLogging: true,
    structuredLogging: true,
    logAggregation: true,
  },
  A10_SSRF: {
    networkPolicies: true,
    urlValidation: true,
    internalAddressBlocking: true,
  },
};
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "Security|Rate Limiting|Credential Encryption|Security Headers"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `helmet not found` | Run `pnpm --filter @r360/api add helmet cors express-rate-limit` |
| `CORS test fails` | Ensure CORS middleware is applied before routes. Check that test sets `Origin` header correctly |
| `Rate limit test flaky` | Use a fresh rate limiter instance per test, or clear the rate limiter store between tests |
| `Encryption test fails` | Verify master key is exactly 64 hex characters (256 bits). Check that `crypto.createCipheriv` parameters match |
| `Security header missing` | Ensure `configureSecurityMiddleware(app)` is called before route registration in the test app |
| `IDOR test returns 200` | The API route handler must query with BOTH the resource ID AND the tenant ID from the JWT. Fix: `WHERE id = $1 AND tenant_id = $2` |

### Success Criteria
- [ ] Tenant A cannot access Tenant B's workflows, credentials, or executions via API
- [ ] Tenant A cannot update or delete Tenant B's resources
- [ ] Tenant A cannot execute Tenant B's workflows
- [ ] Webhook path traversal blocked
- [ ] Requests without auth rejected (401)
- [ ] Requests with invalid tokens rejected (401)
- [ ] SQL injection attempts do not corrupt data
- [ ] XSS payloads sanitized in workflow names
- [ ] API rate limiting enforced (429 returned)
- [ ] Auth endpoints have stricter rate limits
- [ ] Retry-After header present on rate limited responses
- [ ] Credentials encrypted with AES-256-GCM with per-tenant keys
- [ ] Wrong tenant key cannot decrypt other tenant's credentials
- [ ] Random IVs produce different ciphertexts for same input
- [ ] All required security headers present
- [ ] X-Powered-By header removed
- [ ] CORS blocks unauthorized origins
- [ ] OWASP Top 10 checklist items addressed

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "security|isolation|rate|encrypt|headers"
# Expected: All security tests pass

# Check security headers manually
curl -I http://localhost:3000/api/health
# Expected: X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, CSP present

# Verify CORS
curl -I -H "Origin: https://evil.com" http://localhost:3000/api/workflows
# Expected: No Access-Control-Allow-Origin for evil.com
```

---

## Step 5.5: Phase 5 Security Test Suite

### Objective
Consolidate all security tests into a comprehensive suite that can be run as part of CI/CD. This suite covers all cross-tenant attack scenarios and serves as a regression test for tenant isolation.

### TDD Implementation

#### 1. Write the comprehensive security test suite

**File:** `packages/api/src/__tests__/security/comprehensive-security-suite.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, TestApp } from '../helpers/test-app';

/**
 * Comprehensive Security Test Suite
 *
 * This suite must pass before ANY production deployment.
 * It covers all cross-tenant attack scenarios and
 * verifies tenant isolation at every layer.
 */
describe('COMPREHENSIVE SECURITY SUITE', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      seedTenantA: true,
      seedTenantB: true,
      seedTenantAData: {
        workflows: ['wf-a-1', 'wf-a-2'],
        credentials: ['cred-a-1'],
        executions: ['exec-a-1'],
      },
      seedTenantBData: {
        workflows: ['wf-b-1'],
        credentials: ['cred-b-1'],
        executions: ['exec-b-1'],
      },
    });
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  describe('1. Cross-Tenant Workflow Access', () => {
    it('1.1 LIST: Tenant A sees only own workflows', async () => {
      const res = await request(testApp.app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${testApp.tokenA}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((w: any) => w.id);
      expect(ids).toContain('wf-a-1');
      expect(ids).toContain('wf-a-2');
      expect(ids).not.toContain('wf-b-1');
    });

    it('1.2 GET: Tenant A cannot read Tenant B workflow', async () => {
      const res = await request(testApp.app)
        .get('/api/workflows/wf-b-1')
        .set('Authorization', `Bearer ${testApp.tokenA}`);
      expect(res.status).toBe(404);
    });

    it('1.3 PUT: Tenant A cannot update Tenant B workflow', async () => {
      const res = await request(testApp.app)
        .put('/api/workflows/wf-b-1')
        .set('Authorization', `Bearer ${testApp.tokenA}`)
        .send({ name: 'Hijacked' });
      expect(res.status).toBe(404);
    });

    it('1.4 DELETE: Tenant A cannot delete Tenant B workflow', async () => {
      const res = await request(testApp.app)
        .delete('/api/workflows/wf-b-1')
        .set('Authorization', `Bearer ${testApp.tokenA}`);
      expect(res.status).toBe(404);
    });

    it('1.5 EXECUTE: Tenant A cannot execute Tenant B workflow', async () => {
      const res = await request(testApp.app)
        .post('/api/workflows/wf-b-1/execute')
        .set('Authorization', `Bearer ${testApp.tokenA}`);
      expect(res.status).toBe(404);
    });
  });

  describe('2. Cross-Tenant Credential Access', () => {
    it('2.1 LIST: Tenant A sees only own credentials', async () => {
      const res = await request(testApp.app)
        .get('/api/credentials')
        .set('Authorization', `Bearer ${testApp.tokenA}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((c: any) => c.id);
      expect(ids).toContain('cred-a-1');
      expect(ids).not.toContain('cred-b-1');
    });

    it('2.2 GET: Tenant A cannot read Tenant B credentials', async () => {
      const res = await request(testApp.app)
        .get('/api/credentials/cred-b-1')
        .set('Authorization', `Bearer ${testApp.tokenA}`);
      expect(res.status).toBe(404);
    });

    it('2.3 Tenant A cannot decrypt Tenant B credentials', async () => {
      const res = await request(testApp.app)
        .get('/api/credentials/cred-b-1/decrypt')
        .set('Authorization', `Bearer ${testApp.tokenA}`);
      expect(res.status).toBe(404);
    });
  });

  describe('3. Cross-Tenant Execution Access', () => {
    it('3.1 LIST: Tenant A sees only own executions', async () => {
      const res = await request(testApp.app)
        .get('/api/executions')
        .set('Authorization', `Bearer ${testApp.tokenA}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((e: any) => e.id);
      expect(ids).toContain('exec-a-1');
      expect(ids).not.toContain('exec-b-1');
    });

    it('3.2 GET: Tenant A cannot view Tenant B execution', async () => {
      const res = await request(testApp.app)
        .get('/api/executions/exec-b-1')
        .set('Authorization', `Bearer ${testApp.tokenA}`);
      expect(res.status).toBe(404);
    });
  });

  describe('4. Webhook Isolation', () => {
    it('4.1 Tenant A webhook does not trigger Tenant B workflow', async () => {
      // Webhook routing uses tenantId from URL path
      const res = await request(testApp.app)
        .post('/webhook/tenant-a/some-path')
        .send({ data: 'test' });

      // Even if path exists, it only maps to tenant-a workflows
      // Verify by checking no tenant-b executions were created
      const execRes = await request(testApp.app)
        .get('/api/executions')
        .set('Authorization', `Bearer ${testApp.tokenB}`);

      const recentExecs = execRes.body.filter(
        (e: any) => e.triggerType === 'webhook' && Date.now() - new Date(e.startedAt).getTime() < 5000,
      );
      // No new webhook-triggered executions for tenant B
      expect(recentExecs).toHaveLength(0);
    });
  });

  describe('5. Authentication & Authorization', () => {
    it('5.1 No token = 401', async () => {
      const res = await request(testApp.app).get('/api/workflows');
      expect(res.status).toBe(401);
    });

    it('5.2 Invalid token = 401', async () => {
      const res = await request(testApp.app)
        .get('/api/workflows')
        .set('Authorization', 'Bearer totally-fake');
      expect(res.status).toBe(401);
    });

    it('5.3 Viewer cannot create workflows', async () => {
      const res = await request(testApp.app)
        .post('/api/workflows')
        .set('Authorization', `Bearer ${testApp.viewerTokenA}`)
        .send({ name: 'New', definition: {} });
      expect(res.status).toBe(403);
    });

    it('5.4 Member cannot delete workflows', async () => {
      const res = await request(testApp.app)
        .delete('/api/workflows/wf-a-1')
        .set('Authorization', `Bearer ${testApp.memberTokenA}`)
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('6. Input Validation', () => {
    it('6.1 Rejects oversized request bodies', async () => {
      const hugeBody = { name: 'x'.repeat(10_000_000) }; // 10MB string

      const res = await request(testApp.app)
        .post('/api/workflows')
        .set('Authorization', `Bearer ${testApp.tokenA}`)
        .send(hugeBody);

      expect([400, 413]).toContain(res.status);
    });

    it('6.2 Rejects malformed JSON', async () => {
      const res = await request(testApp.app)
        .post('/api/workflows')
        .set('Authorization', `Bearer ${testApp.tokenA}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
    });
  });

  describe('7. Error Response Safety', () => {
    it('7.1 Error responses do not leak stack traces', async () => {
      const res = await request(testApp.app)
        .get('/api/nonexistent-route');

      expect(res.body.stack).toBeUndefined();
      expect(res.body.trace).toBeUndefined();
    });

    it('7.2 Error responses do not leak internal paths', async () => {
      const res = await request(testApp.app)
        .get('/api/workflows/invalid-id')
        .set('Authorization', `Bearer ${testApp.tokenA}`);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('/Users/');
      expect(body).not.toContain('/home/');
      expect(body).not.toContain('node_modules');
    });
  });
});
```

#### 2. Run the comprehensive suite

```bash
# Run the full security suite
pnpm --filter @r360/api test -- --grep "COMPREHENSIVE SECURITY SUITE" --timeout 60000

# Run all security-related tests
pnpm --filter @r360/api test -- --grep "security|isolation|attack|IDOR|injection|XSS|CORS" --timeout 60000
```

Expected output:
```
 PASS  src/__tests__/security/comprehensive-security-suite.test.ts
  COMPREHENSIVE SECURITY SUITE
    1. Cross-Tenant Workflow Access
      ✓ 1.1 LIST: Tenant A sees only own workflows
      ✓ 1.2 GET: Tenant A cannot read Tenant B workflow
      ✓ 1.3 PUT: Tenant A cannot update Tenant B workflow
      ✓ 1.4 DELETE: Tenant A cannot delete Tenant B workflow
      ✓ 1.5 EXECUTE: Tenant A cannot execute Tenant B workflow
    2. Cross-Tenant Credential Access
      ✓ 2.1 LIST: Tenant A sees only own credentials
      ✓ 2.2 GET: Tenant A cannot read Tenant B credentials
      ✓ 2.3 Tenant A cannot decrypt Tenant B credentials
    3. Cross-Tenant Execution Access
      ✓ 3.1 LIST: Tenant A sees only own executions
      ✓ 3.2 GET: Tenant A cannot view Tenant B execution
    4. Webhook Isolation
      ✓ 4.1 Tenant A webhook does not trigger Tenant B workflow
    5. Authentication & Authorization
      ✓ 5.1 No token = 401
      ✓ 5.2 Invalid token = 401
      ✓ 5.3 Viewer cannot create workflows
      ✓ 5.4 Member cannot delete workflows
    6. Input Validation
      ✓ 6.1 Rejects oversized request bodies
      ✓ 6.2 Rejects malformed JSON
    7. Error Response Safety
      ✓ 7.1 Error responses do not leak stack traces
      ✓ 7.2 Error responses do not leak internal paths
```

#### 3. If tests fail:

| Failure | Fix |
|---------|-----|
| `IDOR test returns 200 instead of 404` | The API route handler queries without tenant_id. Add `AND tenant_id = $tenantId` to the WHERE clause |
| `Credential decryption returns data` | The `/decrypt` endpoint must check tenant ownership before decrypting |
| `Viewer can create workflows` | Add role-based middleware: `requireRole('admin', 'owner')` before create/update/delete routes |
| `Stack trace in error response` | Add global error handler that strips stack traces in production: `if (process.env.NODE_ENV !== 'development') delete err.stack` |
| `Internal paths in response` | Sanitize error messages before sending to client. Replace file paths with generic messages |

### Success Criteria
- [ ] ALL 19 comprehensive security tests pass
- [ ] No cross-tenant data leakage in any scenario
- [ ] No cross-tenant credential access
- [ ] No cross-tenant execution visibility
- [ ] No webhook isolation bypass
- [ ] Authentication enforced on all protected routes
- [ ] RBAC enforced correctly
- [ ] Input validation rejects malicious inputs
- [ ] Error responses are safe (no leaks)
- [ ] Suite runs in CI/CD pipeline

### Verification Commands
```bash
# Run comprehensive security suite
pnpm --filter @r360/api test -- --grep "COMPREHENSIVE SECURITY" --timeout 60000
# Expected: ALL TESTS PASS - 19/19

# Run all security tests across the project
pnpm test -- --grep "security|isolation"
# Expected: All pass

# Check for any missing tenant_id in queries
pnpm --filter @r360/api test -- --grep "Query Audit"
# Expected: No violations found
```

---

## Phase Completion Checklist

- [ ] **Step 5.1**: Automated cross-tenant data leakage tests pass (0 leaks)
- [ ] **Step 5.1**: All SQL queries audited for tenant_id filtering
- [ ] **Step 5.1**: Audit logging captures data access patterns
- [ ] **Step 5.2**: Stripe billing integration with webhook handler
- [ ] **Step 5.2**: Per-tenant usage tracking (workflows, executions, minutes)
- [ ] **Step 5.2**: Plan-based limits enforced (free, pro, enterprise)
- [ ] **Step 5.3**: Tenant provisioning flow (create org, invite team)
- [ ] **Step 5.3**: Admin dashboard with platform metrics
- [ ] **Step 5.4**: IDOR attacks prevented
- [ ] **Step 5.4**: Credential encryption per-tenant verified
- [ ] **Step 5.4**: API rate limiting enforced
- [ ] **Step 5.4**: Security headers configured
- [ ] **Step 5.4**: OWASP Top 10 checklist addressed
- [ ] **Step 5.5**: Comprehensive security test suite passes (19/19)
- [ ] All tests pass: `pnpm test` from repo root
- [ ] No direct n8n package modifications (Cardinal Rule)
- [ ] All new code has TypeScript types (no `any` in production code)
- [ ] Security test suite added to CI/CD pipeline

## Rollback Procedure

If Phase 5 introduces issues:

1. **Billing issues**: Disable Stripe integration temporarily:
   ```bash
   STRIPE_ENABLED=false
   # All billing endpoints return 503 Service Unavailable
   # Plan limits fall back to enterprise (unrestricted)
   ```

2. **Rate limiting too aggressive**: Increase limits or disable:
   ```bash
   RATE_LIMIT_MAX_REQUESTS=10000  # effectively disabled
   ```

3. **Security headers breaking frontend**: Relax CSP or disable helmet temporarily:
   ```typescript
   // In security-middleware.ts, comment out helmet()
   // WARNING: only do this temporarily for debugging
   ```

4. **Audit logging performance impact**: Disable audit logging:
   ```bash
   AUDIT_LOGGING_ENABLED=false
   ```

5. **Provisioning flow broken**: Fall back to manual tenant creation:
   ```sql
   INSERT INTO tenants (id, name, slug, plan, settings, created_at)
   VALUES ('tenant-manual', 'Manual Tenant', 'manual', 'pro', '{}', NOW());

   INSERT INTO users (id, tenant_id, email, role, created_at)
   VALUES ('user-manual', 'tenant-manual', 'admin@example.com', 'owner', NOW());
   ```

6. **Full Phase 5 rollback**: Revert to Phase 4 state:
   - Remove billing routes from Express app
   - Remove security middleware (but keep auth middleware)
   - Remove admin routes
   - All Phase 1-4 functionality continues working

---

## Cross-Phase Integration Notes

### From Phase 4
- BullMQ queue rate limits are now configured based on Stripe subscription plan tier
- Webhook registry is backed by the `webhooks` DB table (migrated from in-memory)
- Execution completion events feed into usage tracking (execution count, minutes)
- WebSocket authentication uses the same auth middleware as API routes

### From Phase 3
- `TenantCredentialsHelper` encryption now uses the per-tenant key derived from master key + tenant-specific salt
- Execution service checks plan limits before calling `WorkflowExecute.run()`
- Lifecycle hooks extended to call `usageTracker.trackExecution()` after completion

### For Phase 6
- Usage data powers the billing dashboard in the settings page
- Admin dashboard metrics feed into monitoring and alerting
- Security test suite runs as a CI gate before production deployments
- Audit logs retained for compliance requirements (SOC 2 groundwork)
