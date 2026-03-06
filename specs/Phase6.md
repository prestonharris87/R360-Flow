# Phase 6: Polish & Launch

## Overview
- **Goal**: Finalize the platform for production launch with workflow templates, error handling UX, versioning, white-label theming, documentation, monitoring, load testing, and a comprehensive production readiness gate that verifies all six phases are complete and battle-tested.
- **Prerequisites**: Phases 1-5 complete -- API server with tenant-aware data layer, Workflow Builder UI connected to API, n8n execution engine integrated, BullMQ queue with rate limiting, webhooks, scheduling, real-time monitoring, Stripe billing, tenant provisioning, and security hardening all functional and tested.
- **Cardinal Rule Checkpoint**: n8n packages (`n8n-workflow`, `n8n-core`, `n8n-nodes-base`, `@n8n/di`, `@n8n/config`, `@n8n/backend-common`, `@n8n/errors`, `@n8n/constants`, `@n8n/decorators`) remain UNMODIFIED npm dependencies. All polish, theming, versioning, and monitoring wrap around the existing architecture. No n8n code is forked, patched, or monkey-patched at any point in this phase.
- **Duration Estimate**: 3-4 weeks (Weeks 11-14)
- **Key Deliverables**:
  - Workflow templates gallery with global and per-tenant template CRUD
  - Error handling UX with retry, notifications, and error detail views
  - Workflow versioning with history, rollback, diff view, and copy-on-write semantics
  - Per-tenant theming and white-label branding configuration
  - OpenAPI/Swagger documentation, user guide, and developer docs
  - Datadog/Sentry monitoring with health dashboard and alert rules
  - Production load test suite validating multi-tenant scale
  - Production readiness checklist -- the FINAL GATE before launch

## Environment Setup

### Required Tools and Versions
```
Node.js >= 20.x
pnpm >= 9.x
PostgreSQL >= 15.x (from Phase 1)
Redis >= 7.x (from Phase 4)
Stripe CLI >= 1.19.x (from Phase 5)
Docker + Docker Compose
TypeScript >= 5.4
k6 >= 0.49.x (load testing)
Sentry CLI >= 2.x (error tracking)
```

### Environment Variables
```bash
# Monitoring (Datadog)
DD_API_KEY=xxxxx
DD_APP_KEY=xxxxx
DD_SERVICE=r360-flow
DD_ENV=production
DD_SITE=datadoghq.com

# Monitoring (Sentry)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=1.0.0

# Theming
DEFAULT_THEME=light
ALLOW_CUSTOM_BRANDING=true

# Documentation
API_DOCS_ENABLED=true
API_DOCS_PATH=/api/docs

# Load Testing
LOAD_TEST_BASE_URL=http://localhost:3000
LOAD_TEST_TENANT_COUNT=50
LOAD_TEST_DURATION_SECONDS=300

# Versioning
MAX_WORKFLOW_VERSIONS=100
VERSION_RETENTION_DAYS=365
```

### Infrastructure Prerequisites
```yaml
# infrastructure/docker-compose.yml additions
services:
  # Datadog Agent (local dev)
  datadog-agent:
    image: gcr.io/datadoghq/agent:7
    environment:
      - DD_API_KEY=${DD_API_KEY}
      - DD_SITE=datadoghq.com
      - DD_APM_ENABLED=true
      - DD_LOGS_ENABLED=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "8126:8126"   # APM traces
      - "8125:8125"   # StatsD metrics
```

### Package Installation
```bash
cd /Users/preston/Documents/Claude/R360-Flow

# Documentation
pnpm --filter @r360/api add swagger-ui-express swagger-jsdoc
pnpm --filter @r360/api add -D @types/swagger-ui-express @types/swagger-jsdoc

# Monitoring
pnpm --filter @r360/api add @sentry/node dd-trace prom-client
pnpm --filter @r360/api add -D @types/prom-client

# Diff engine (workflow versioning)
pnpm --filter @r360/api add deep-diff
pnpm --filter @r360/api add -D @types/deep-diff

# Load testing
pnpm add -Dw k6

# Theming (frontend)
pnpm --filter workflowbuilder add chroma-js
pnpm --filter workflowbuilder add -D @types/chroma-js
```

### Setup Verification Commands
```bash
# Verify all Phase 1-5 tests still pass
pnpm test
# Expected: All tests passing

# Verify Sentry CLI
sentry-cli --version
# Expected: sentry-cli X.X.X

# Verify k6 for load testing
k6 version
# Expected: k6 vX.X.X

# Verify Swagger packages
node -e "require('swagger-ui-express'); require('swagger-jsdoc'); console.log('Swagger OK')"
# Expected: Swagger OK
```

---

## Step 6.1: Workflow Templates Gallery

### Objective
Build a workflow templates system with global (platform-wide) and per-tenant templates. Users can browse, preview, and import templates into their tenant's workflow list. Admins can create, update, and delete templates. Templates are stored with metadata including category, description, tags, and a frozen workflow definition snapshot.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/templates/workflow-templates.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TemplateService } from '../../services/template-service';
import { createTestDb, TestDb } from '../helpers/test-db';

describe('WorkflowTemplateService', () => {
  let db: TestDb;
  let service: TemplateService;

  const TENANT_A = 'tenant-templates-a';
  const TENANT_B = 'tenant-templates-b';

  beforeAll(async () => {
    db = await createTestDb();
    service = new TemplateService(db);

    await db.tenants.create({ id: TENANT_A, name: 'Tenant A', slug: 'tmpl-a', plan: 'pro' });
    await db.tenants.create({ id: TENANT_B, name: 'Tenant B', slug: 'tmpl-b', plan: 'pro' });
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('Global Templates (platform-managed)', () => {
    it('should create a global template', async () => {
      const template = await service.createGlobalTemplate({
        name: 'Slack Notification Pipeline',
        description: 'Send Slack messages on webhook trigger',
        category: 'notifications',
        tags: ['slack', 'webhook', 'notifications'],
        definition: {
          nodes: [
            { id: 'trigger', type: 'n8n-nodes-base.webhook', parameters: {} },
            { id: 'slack', type: 'n8n-nodes-base.slack', parameters: {} },
          ],
          connections: { trigger: { main: [[{ node: 'slack', type: 'main', index: 0 }]] } },
        },
        icon: 'slack',
      });

      expect(template.id).toBeDefined();
      expect(template.scope).toBe('global');
      expect(template.tenantId).toBeNull();
      expect(template.name).toBe('Slack Notification Pipeline');
      expect(template.category).toBe('notifications');
    });

    it('should list global templates for any tenant', async () => {
      const templates = await service.listTemplates({ tenantId: TENANT_A, scope: 'global' });
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.scope === 'global')).toBe(true);
    });

    it('should filter templates by category', async () => {
      const templates = await service.listTemplates({
        tenantId: TENANT_A,
        scope: 'all',
        category: 'notifications',
      });
      expect(templates.every(t => t.category === 'notifications')).toBe(true);
    });

    it('should search templates by name and tags', async () => {
      const results = await service.searchTemplates({
        query: 'slack',
        tenantId: TENANT_A,
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name.toLowerCase()).toContain('slack');
    });
  });

  describe('Per-Tenant Templates', () => {
    it('should create a tenant-scoped template', async () => {
      const template = await service.createTenantTemplate({
        tenantId: TENANT_A,
        name: 'Custom CRM Sync',
        description: 'Tenant A specific CRM integration',
        category: 'crm',
        tags: ['crm', 'sync'],
        definition: {
          nodes: [{ id: 'cron', type: 'n8n-nodes-base.cron', parameters: {} }],
          connections: {},
        },
      });

      expect(template.scope).toBe('tenant');
      expect(template.tenantId).toBe(TENANT_A);
    });

    it('should NOT show Tenant A templates to Tenant B', async () => {
      const templates = await service.listTemplates({ tenantId: TENANT_B, scope: 'tenant' });
      const tenantATemplates = templates.filter(t => t.tenantId === TENANT_A);
      expect(tenantATemplates).toHaveLength(0);
    });

    it('should show both global and tenant templates when scope is all', async () => {
      const templates = await service.listTemplates({ tenantId: TENANT_A, scope: 'all' });
      const globalTemplates = templates.filter(t => t.scope === 'global');
      const tenantTemplates = templates.filter(t => t.scope === 'tenant');
      expect(globalTemplates.length).toBeGreaterThan(0);
      expect(tenantTemplates.length).toBeGreaterThan(0);
    });
  });

  describe('Template Import', () => {
    it('should import a template as a new workflow for the tenant', async () => {
      const templates = await service.listTemplates({ tenantId: TENANT_A, scope: 'global' });
      const template = templates[0];

      const workflow = await service.importTemplate({
        templateId: template.id,
        tenantId: TENANT_A,
        createdBy: 'user-a-1',
        name: 'My Slack Pipeline (from template)',
      });

      expect(workflow.id).toBeDefined();
      expect(workflow.tenantId).toBe(TENANT_A);
      expect(workflow.name).toBe('My Slack Pipeline (from template)');
      expect(workflow.definitionJson).toEqual(template.definition);
      expect(workflow.templateId).toBe(template.id);
    });

    it('should not allow importing a tenant template from another tenant', async () => {
      const tenantATemplates = await service.listTemplates({ tenantId: TENANT_A, scope: 'tenant' });
      const template = tenantATemplates[0];

      await expect(
        service.importTemplate({
          templateId: template.id,
          tenantId: TENANT_B,
          createdBy: 'user-b-1',
        }),
      ).rejects.toThrow(/not found|not accessible/i);
    });
  });

  describe('Template CRUD', () => {
    it('should update a global template', async () => {
      const templates = await service.listTemplates({ tenantId: TENANT_A, scope: 'global' });
      const updated = await service.updateGlobalTemplate(templates[0].id, {
        description: 'Updated description',
        tags: ['slack', 'updated'],
      });
      expect(updated.description).toBe('Updated description');
    });

    it('should delete a global template', async () => {
      const template = await service.createGlobalTemplate({
        name: 'To Be Deleted',
        description: 'Will be deleted',
        category: 'test',
        tags: [],
        definition: { nodes: [], connections: {} },
      });

      await service.deleteGlobalTemplate(template.id);
      const templates = await service.listTemplates({ tenantId: TENANT_A, scope: 'global' });
      expect(templates.find(t => t.id === template.id)).toBeUndefined();
    });
  });
});
```

#### 2. Implement the feature

**Migration:** `packages/db/migrations/020_workflow_templates.sql`

```sql
CREATE TABLE workflow_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL for global
  scope        VARCHAR(10) NOT NULL CHECK (scope IN ('global', 'tenant')),
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  category     VARCHAR(100) NOT NULL,
  tags         TEXT[] DEFAULT '{}',
  icon         VARCHAR(100),
  definition   JSONB NOT NULL,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_scope ON workflow_templates(scope);
CREATE INDEX idx_templates_tenant ON workflow_templates(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_templates_category ON workflow_templates(category);
CREATE INDEX idx_templates_tags ON workflow_templates USING GIN(tags);
CREATE INDEX idx_templates_search ON workflow_templates USING GIN(
  to_tsvector('english', name || ' ' || COALESCE(description, ''))
);

-- Add template_id reference to workflows table
ALTER TABLE workflows ADD COLUMN template_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL;
```

**File:** `packages/api/src/services/template-service.ts`

```typescript
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface TemplateCreateInput {
  name: string;
  description?: string;
  category: string;
  tags: string[];
  definition: Record<string, unknown>;
  icon?: string;
}

export interface TemplateListFilter {
  tenantId: string;
  scope: 'global' | 'tenant' | 'all';
  category?: string;
}

export interface TemplateSearchInput {
  query: string;
  tenantId: string;
  category?: string;
  limit?: number;
}

export interface TemplateImportInput {
  templateId: string;
  tenantId: string;
  createdBy: string;
  name?: string;
}

export interface WorkflowTemplate {
  id: string;
  tenantId: string | null;
  scope: 'global' | 'tenant';
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  icon: string | null;
  definition: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class TemplateService {
  constructor(private readonly db: Pool) {}

  async createGlobalTemplate(input: TemplateCreateInput): Promise<WorkflowTemplate> {
    const id = randomUUID();
    const result = await this.db.query(
      `INSERT INTO workflow_templates (id, tenant_id, scope, name, description, category, tags, icon, definition)
       VALUES ($1, NULL, 'global', $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, input.name, input.description ?? null, input.category, input.tags, input.icon ?? null, JSON.stringify(input.definition)],
    );
    return this.mapRow(result.rows[0]);
  }

  async createTenantTemplate(input: TemplateCreateInput & { tenantId: string }): Promise<WorkflowTemplate> {
    const id = randomUUID();
    const result = await this.db.query(
      `INSERT INTO workflow_templates (id, tenant_id, scope, name, description, category, tags, icon, definition)
       VALUES ($1, $2, 'tenant', $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, input.tenantId, input.name, input.description ?? null, input.category, input.tags, input.icon ?? null, JSON.stringify(input.definition)],
    );
    return this.mapRow(result.rows[0]);
  }

  async listTemplates(filter: TemplateListFilter): Promise<WorkflowTemplate[]> {
    let query: string;
    let params: unknown[];

    if (filter.scope === 'global') {
      query = `SELECT * FROM workflow_templates WHERE scope = 'global'`;
      params = [];
    } else if (filter.scope === 'tenant') {
      query = `SELECT * FROM workflow_templates WHERE scope = 'tenant' AND tenant_id = $1`;
      params = [filter.tenantId];
    } else {
      query = `SELECT * FROM workflow_templates WHERE scope = 'global' OR (scope = 'tenant' AND tenant_id = $1)`;
      params = [filter.tenantId];
    }

    if (filter.category) {
      params.push(filter.category);
      query += ` AND category = $${params.length}`;
    }

    query += ' ORDER BY name ASC';

    const result = await this.db.query(query, params);
    return result.rows.map(row => this.mapRow(row));
  }

  async searchTemplates(input: TemplateSearchInput): Promise<WorkflowTemplate[]> {
    const limit = input.limit ?? 20;
    const result = await this.db.query(
      `SELECT *, ts_rank(
         to_tsvector('english', name || ' ' || COALESCE(description, '')),
         plainto_tsquery('english', $1)
       ) AS rank
       FROM workflow_templates
       WHERE (scope = 'global' OR (scope = 'tenant' AND tenant_id = $2))
         AND (
           to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)
           OR $1 = ANY(tags)
         )
       ORDER BY rank DESC
       LIMIT $3`,
      [input.query, input.tenantId, limit],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async importTemplate(input: TemplateImportInput): Promise<Record<string, unknown>> {
    const templateResult = await this.db.query(
      `SELECT * FROM workflow_templates
       WHERE id = $1 AND (scope = 'global' OR (scope = 'tenant' AND tenant_id = $2))`,
      [input.templateId, input.tenantId],
    );

    if (templateResult.rows.length === 0) {
      throw new Error('Template not found or not accessible');
    }

    const template = templateResult.rows[0];
    const workflowId = randomUUID();
    const workflowName = input.name ?? `${template.name} (from template)`;

    const result = await this.db.query(
      `INSERT INTO workflows (id, tenant_id, name, definition_json, is_active, created_by, template_id)
       VALUES ($1, $2, $3, $4, false, $5, $6)
       RETURNING *`,
      [workflowId, input.tenantId, workflowName, template.definition, input.createdBy, input.templateId],
    );

    return {
      id: result.rows[0].id,
      tenantId: result.rows[0].tenant_id,
      name: result.rows[0].name,
      definitionJson: result.rows[0].definition_json,
      templateId: result.rows[0].template_id,
    };
  }

  async updateGlobalTemplate(id: string, updates: Partial<TemplateCreateInput>): Promise<WorkflowTemplate> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let paramIndex = 2;

    if (updates.name !== undefined) { setClauses.push(`name = $${paramIndex++}`); params.push(updates.name); }
    if (updates.description !== undefined) { setClauses.push(`description = $${paramIndex++}`); params.push(updates.description); }
    if (updates.category !== undefined) { setClauses.push(`category = $${paramIndex++}`); params.push(updates.category); }
    if (updates.tags !== undefined) { setClauses.push(`tags = $${paramIndex++}`); params.push(updates.tags); }
    if (updates.icon !== undefined) { setClauses.push(`icon = $${paramIndex++}`); params.push(updates.icon); }
    if (updates.definition !== undefined) { setClauses.push(`definition = $${paramIndex++}`); params.push(JSON.stringify(updates.definition)); }

    const result = await this.db.query(
      `UPDATE workflow_templates SET ${setClauses.join(', ')} WHERE id = $1 AND scope = 'global' RETURNING *`,
      params,
    );
    return this.mapRow(result.rows[0]);
  }

  async deleteGlobalTemplate(id: string): Promise<void> {
    await this.db.query(`DELETE FROM workflow_templates WHERE id = $1 AND scope = 'global'`, [id]);
  }

  private mapRow(row: Record<string, unknown>): WorkflowTemplate {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string | null,
      scope: row.scope as 'global' | 'tenant',
      name: row.name as string,
      description: row.description as string | null,
      category: row.category as string,
      tags: row.tags as string[],
      icon: row.icon as string | null,
      definition: row.definition as Record<string, unknown>,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "WorkflowTemplateService"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Template search returns no results` | Ensure PostgreSQL `pg_trgm` or full-text search extension is enabled. Check that `to_tsvector` index exists |
| `Tenant B sees Tenant A templates` | Verify the WHERE clause includes `AND tenant_id = $tenantId` for tenant-scoped queries |
| `Import fails with FK violation` | Ensure `template_id` column exists on `workflows` table. Run migration |
| `Tags filter not working` | Ensure `tags` column is `TEXT[]` and GIN index is created |

### Success Criteria
- [ ] Global template CRUD (create, list, update, delete)
- [ ] Tenant-scoped template CRUD
- [ ] Cross-tenant template isolation (Tenant A templates invisible to Tenant B)
- [ ] Template search by name, description, and tags
- [ ] Template category filtering
- [ ] Template import creates a new tenant-scoped workflow with definition snapshot
- [ ] Cross-tenant template import blocked

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "template"
# Expected: All template tests pass

# Manual test (with server running)
curl -X POST http://localhost:3000/api/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Template","category":"test","tags":["test"],"definition":{"nodes":[],"connections":{}}}'
# Expected: 201 Created
```

---

## Step 6.2: Error Handling UX

### Objective
Build comprehensive error handling for workflow executions: retry failed executions (manual and automatic), error notification system (in-app and email), and a detailed error view in the UI showing the failed node, error message, input/output data, and stack trace (sanitized).

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/errors/execution-error-handling.test.ts`

```typescript
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { ExecutionErrorService } from '../../services/execution-error-service';
import { createTestDb, TestDb } from '../helpers/test-db';

describe('ExecutionErrorService', () => {
  let db: TestDb;
  let service: ExecutionErrorService;
  let mockNotifier: any;

  const TENANT = 'tenant-errors';

  beforeAll(async () => {
    db = await createTestDb();
    await db.tenants.create({ id: TENANT, name: 'Error Tenant', slug: 'errors', plan: 'pro' });
  });

  beforeEach(() => {
    mockNotifier = {
      sendInApp: vi.fn().mockResolvedValue(undefined),
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };
    service = new ExecutionErrorService(db, mockNotifier);
  });

  describe('Error Detail View', () => {
    it('should return structured error details for a failed execution', async () => {
      await db.executions.create({
        id: 'exec-fail-1',
        tenantId: TENANT,
        workflowId: 'wf-1',
        status: 'error',
        error: JSON.stringify({
          message: 'Authentication failed',
          nodeId: 'slack-node-1',
          nodeName: 'Send Slack Message',
          nodeType: 'n8n-nodes-base.slack',
          timestamp: new Date().toISOString(),
        }),
      });

      await db.executionSteps.create({
        id: 'step-fail-1',
        executionId: 'exec-fail-1',
        nodeId: 'slack-node-1',
        status: 'error',
        inputJson: { message: 'Hello' },
        outputJson: null,
        error: 'OAuth token expired',
      });

      const details = await service.getErrorDetails('exec-fail-1', TENANT);

      expect(details.executionId).toBe('exec-fail-1');
      expect(details.status).toBe('error');
      expect(details.failedNode).toBeDefined();
      expect(details.failedNode.nodeId).toBe('slack-node-1');
      expect(details.failedNode.nodeName).toBe('Send Slack Message');
      expect(details.failedNode.error).toBe('OAuth token expired');
      expect(details.failedNode.input).toEqual({ message: 'Hello' });
      expect(details.failedNode.output).toBeNull();
    });

    it('should sanitize stack traces (no file paths)', async () => {
      await db.executions.create({
        id: 'exec-fail-2',
        tenantId: TENANT,
        workflowId: 'wf-1',
        status: 'error',
        error: JSON.stringify({
          message: 'TypeError: Cannot read property',
          stack: 'TypeError: Cannot read property\n    at Object.<anonymous> (/Users/dev/r360/src/handler.ts:42:10)',
        }),
      });

      const details = await service.getErrorDetails('exec-fail-2', TENANT);
      expect(details.error.stack).not.toContain('/Users/');
      expect(details.error.stack).not.toContain('/home/');
    });
  });

  describe('Manual Retry', () => {
    it('should retry a failed execution with the same inputs', async () => {
      await db.workflows.create({
        id: 'wf-retry',
        tenantId: TENANT,
        name: 'Retryable Workflow',
        definitionJson: { nodes: [], connections: {} },
        isActive: true,
      });

      await db.executions.create({
        id: 'exec-retry-1',
        tenantId: TENANT,
        workflowId: 'wf-retry',
        status: 'error',
        contextJson: { triggerData: { body: { key: 'value' } } },
      });

      const retryExecution = await service.retryExecution('exec-retry-1', TENANT);

      expect(retryExecution.id).not.toBe('exec-retry-1');
      expect(retryExecution.workflowId).toBe('wf-retry');
      expect(retryExecution.status).toBe('pending');
      expect(retryExecution.retryOf).toBe('exec-retry-1');
      expect(retryExecution.contextJson).toEqual({ triggerData: { body: { key: 'value' } } });
    });

    it('should reject retry of a successful execution', async () => {
      await db.executions.create({
        id: 'exec-success-1',
        tenantId: TENANT,
        workflowId: 'wf-retry',
        status: 'success',
      });

      await expect(
        service.retryExecution('exec-success-1', TENANT),
      ).rejects.toThrow(/only failed executions can be retried/i);
    });

    it('should reject retry from a different tenant', async () => {
      await expect(
        service.retryExecution('exec-retry-1', 'tenant-other'),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('Auto-Retry Configuration', () => {
    it('should configure auto-retry for a workflow', async () => {
      const config = await service.setAutoRetryConfig('wf-retry', TENANT, {
        enabled: true,
        maxRetries: 3,
        backoffMs: 5000,
        backoffMultiplier: 2,
      });

      expect(config.enabled).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.backoffMs).toBe(5000);
    });

    it('should not auto-retry beyond max retries', async () => {
      const shouldRetry = await service.shouldAutoRetry('exec-retry-1', TENANT, 4);
      expect(shouldRetry).toBe(false);
    });
  });

  describe('Error Notifications', () => {
    it('should send in-app notification on execution failure', async () => {
      await service.notifyExecutionFailure({
        executionId: 'exec-fail-1',
        tenantId: TENANT,
        workflowName: 'Slack Pipeline',
        error: 'OAuth token expired',
        channel: 'in_app',
      });

      expect(mockNotifier.sendInApp).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT,
          type: 'execution_failure',
          title: expect.stringContaining('Slack Pipeline'),
        }),
      );
    });

    it('should send email notification on execution failure', async () => {
      await service.notifyExecutionFailure({
        executionId: 'exec-fail-1',
        tenantId: TENANT,
        workflowName: 'Slack Pipeline',
        error: 'OAuth token expired',
        channel: 'email',
      });

      expect(mockNotifier.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('failed'),
        }),
      );
    });
  });
});
```

#### 2. Implement the feature

**Migration:** `packages/db/migrations/021_execution_retry.sql`

```sql
-- Add retry tracking to executions
ALTER TABLE executions ADD COLUMN retry_of UUID REFERENCES executions(id) ON DELETE SET NULL;
ALTER TABLE executions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_executions_retry_of ON executions(retry_of) WHERE retry_of IS NOT NULL;

-- Auto-retry configuration per workflow
CREATE TABLE workflow_retry_config (
  workflow_id  UUID PRIMARY KEY REFERENCES workflows(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  max_retries  INTEGER NOT NULL DEFAULT 3,
  backoff_ms   INTEGER NOT NULL DEFAULT 5000,
  backoff_multiplier NUMERIC(3,1) NOT NULL DEFAULT 2.0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID,
  type         VARCHAR(50) NOT NULL,
  title        VARCHAR(500) NOT NULL,
  body         TEXT,
  metadata     JSONB DEFAULT '{}',
  read         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_tenant_unread ON notifications(tenant_id, read) WHERE read = false;
```

**File:** `packages/api/src/services/execution-error-service.ts`

```typescript
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

interface ErrorDetails {
  executionId: string;
  status: string;
  error: { message: string; stack?: string };
  failedNode: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    error: string;
    input: unknown;
    output: unknown;
  } | null;
  startedAt: Date;
  finishedAt: Date | null;
}

interface AutoRetryConfig {
  enabled: boolean;
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

interface NotificationInput {
  executionId: string;
  tenantId: string;
  workflowName: string;
  error: string;
  channel: 'in_app' | 'email' | 'both';
}

export class ExecutionErrorService {
  constructor(
    private readonly db: Pool,
    private readonly notifier: {
      sendInApp: (payload: Record<string, unknown>) => Promise<void>;
      sendEmail: (payload: Record<string, unknown>) => Promise<void>;
    },
  ) {}

  async getErrorDetails(executionId: string, tenantId: string): Promise<ErrorDetails> {
    const execResult = await this.db.query(
      `SELECT * FROM executions WHERE id = $1 AND tenant_id = $2`,
      [executionId, tenantId],
    );

    if (execResult.rows.length === 0) {
      throw new Error('Execution not found');
    }

    const execution = execResult.rows[0];
    const errorData = typeof execution.error === 'string' ? JSON.parse(execution.error) : execution.error;

    // Sanitize stack traces
    if (errorData?.stack) {
      errorData.stack = this.sanitizeStackTrace(errorData.stack);
    }

    // Get failed step details
    const stepResult = await this.db.query(
      `SELECT * FROM execution_steps WHERE execution_id = $1 AND status = 'error' LIMIT 1`,
      [executionId],
    );

    const failedNode = stepResult.rows.length > 0 ? {
      nodeId: stepResult.rows[0].node_id,
      nodeName: errorData?.nodeName ?? stepResult.rows[0].node_id,
      nodeType: errorData?.nodeType ?? 'unknown',
      error: stepResult.rows[0].error,
      input: stepResult.rows[0].input_json,
      output: stepResult.rows[0].output_json,
    } : null;

    return {
      executionId,
      status: execution.status,
      error: errorData ?? { message: 'Unknown error' },
      failedNode,
      startedAt: execution.started_at,
      finishedAt: execution.finished_at,
    };
  }

  async retryExecution(executionId: string, tenantId: string): Promise<Record<string, unknown>> {
    const execResult = await this.db.query(
      `SELECT * FROM executions WHERE id = $1 AND tenant_id = $2`,
      [executionId, tenantId],
    );

    if (execResult.rows.length === 0) {
      throw new Error('Execution not found');
    }

    const execution = execResult.rows[0];

    if (execution.status !== 'error') {
      throw new Error('Only failed executions can be retried');
    }

    const newId = randomUUID();
    const result = await this.db.query(
      `INSERT INTO executions (id, tenant_id, workflow_id, status, context_json, retry_of, retry_count)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)
       RETURNING *`,
      [newId, tenantId, execution.workflow_id, execution.context_json, executionId, execution.retry_count + 1],
    );

    return {
      id: result.rows[0].id,
      workflowId: result.rows[0].workflow_id,
      status: result.rows[0].status,
      retryOf: result.rows[0].retry_of,
      contextJson: result.rows[0].context_json,
    };
  }

  async setAutoRetryConfig(
    workflowId: string,
    tenantId: string,
    config: AutoRetryConfig,
  ): Promise<AutoRetryConfig> {
    await this.db.query(
      `INSERT INTO workflow_retry_config (workflow_id, tenant_id, enabled, max_retries, backoff_ms, backoff_multiplier)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workflow_id) DO UPDATE SET
         enabled = $3, max_retries = $4, backoff_ms = $5, backoff_multiplier = $6, updated_at = NOW()`,
      [workflowId, tenantId, config.enabled, config.maxRetries, config.backoffMs, config.backoffMultiplier],
    );
    return config;
  }

  async shouldAutoRetry(executionId: string, tenantId: string, currentRetryCount: number): Promise<boolean> {
    const execResult = await this.db.query(
      `SELECT e.workflow_id, rc.enabled, rc.max_retries
       FROM executions e
       LEFT JOIN workflow_retry_config rc ON rc.workflow_id = e.workflow_id AND rc.tenant_id = e.tenant_id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [executionId, tenantId],
    );

    if (execResult.rows.length === 0) return false;
    const row = execResult.rows[0];
    if (!row.enabled) return false;
    return currentRetryCount < row.max_retries;
  }

  async notifyExecutionFailure(input: NotificationInput): Promise<void> {
    const title = `Workflow "${input.workflowName}" failed`;
    const body = `Execution ${input.executionId} failed: ${input.error}`;

    if (input.channel === 'in_app' || input.channel === 'both') {
      await this.notifier.sendInApp({
        tenantId: input.tenantId,
        type: 'execution_failure',
        title,
        body,
        metadata: { executionId: input.executionId },
      });
    }

    if (input.channel === 'email' || input.channel === 'both') {
      await this.notifier.sendEmail({
        tenantId: input.tenantId,
        subject: `Workflow execution failed: ${input.workflowName}`,
        body,
        metadata: { executionId: input.executionId },
      });
    }
  }

  private sanitizeStackTrace(stack: string): string {
    return stack.replace(/\s+at\s+.*\(\/[^\)]+\)/g, '    at [internal]');
  }
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "ExecutionErrorService"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `retry_of column not found` | Run migration `021_execution_retry.sql` |
| `Stack trace not sanitized` | Verify regex pattern matches `/Users/` and `/home/` style paths |
| `Retry of success allowed` | Check status check: `execution.status !== 'error'` |
| `Notification not sent` | Verify mock notifier methods are properly wired |

### Success Criteria
- [ ] Structured error details returned with failed node info
- [ ] Stack traces sanitized (no file paths exposed)
- [ ] Manual retry creates new pending execution with original inputs
- [ ] Retry blocked for successful executions
- [ ] Cross-tenant retry blocked
- [ ] Auto-retry configuration per workflow
- [ ] In-app and email error notifications sent

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "error|retry|notification"
# Expected: All error handling tests pass
```

---

## Step 6.3: Workflow Versioning

### Objective
Implement workflow versioning with a `workflow_versions` table using copy-on-write semantics. Every save creates a new version. Users can view version history, compare versions with a diff view, and rollback to any previous version. Version metadata includes author, timestamp, and change description.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/versioning/workflow-versioning.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { WorkflowVersioningService } from '../../services/workflow-versioning-service';
import { createTestDb, TestDb } from '../helpers/test-db';

describe('WorkflowVersioningService', () => {
  let db: TestDb;
  let service: WorkflowVersioningService;

  const TENANT = 'tenant-versioning';
  const WORKFLOW_ID = 'wf-versioned-1';

  beforeAll(async () => {
    db = await createTestDb();
    service = new WorkflowVersioningService(db);

    await db.tenants.create({ id: TENANT, name: 'Versioning Tenant', slug: 'ver', plan: 'pro' });
    await db.workflows.create({
      id: WORKFLOW_ID,
      tenantId: TENANT,
      name: 'Versioned Workflow',
      definitionJson: {
        nodes: [{ id: 'trigger', type: 'webhook', parameters: {} }],
        connections: {},
      },
      isActive: false,
    });
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('Copy-on-Write Saves', () => {
    it('should create version 1 on first save', async () => {
      const version = await service.saveVersion({
        workflowId: WORKFLOW_ID,
        tenantId: TENANT,
        userId: 'user-1',
        definition: {
          nodes: [{ id: 'trigger', type: 'webhook', parameters: {} }],
          connections: {},
        },
        changeDescription: 'Initial version',
      });

      expect(version.versionNumber).toBe(1);
      expect(version.changeDescription).toBe('Initial version');
      expect(version.createdBy).toBe('user-1');
    });

    it('should increment version number on subsequent saves', async () => {
      const v2 = await service.saveVersion({
        workflowId: WORKFLOW_ID,
        tenantId: TENANT,
        userId: 'user-1',
        definition: {
          nodes: [
            { id: 'trigger', type: 'webhook', parameters: {} },
            { id: 'slack', type: 'slack', parameters: { channel: '#general' } },
          ],
          connections: { trigger: { main: [[{ node: 'slack', type: 'main', index: 0 }]] } },
        },
        changeDescription: 'Added Slack node',
      });

      expect(v2.versionNumber).toBe(2);
    });

    it('should store full definition snapshot per version (copy-on-write)', async () => {
      const v1 = await service.getVersion(WORKFLOW_ID, TENANT, 1);
      const v2 = await service.getVersion(WORKFLOW_ID, TENANT, 2);

      expect(v1.definition.nodes).toHaveLength(1);
      expect(v2.definition.nodes).toHaveLength(2);
    });
  });

  describe('Version History', () => {
    it('should list all versions for a workflow', async () => {
      const history = await service.listVersions(WORKFLOW_ID, TENANT);

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].versionNumber).toBeGreaterThan(history[1].versionNumber);
    });

    it('should not list versions from another tenant', async () => {
      const history = await service.listVersions(WORKFLOW_ID, 'tenant-other');
      expect(history).toHaveLength(0);
    });
  });

  describe('Diff View', () => {
    it('should generate a diff between two versions', async () => {
      const diff = await service.diffVersions(WORKFLOW_ID, TENANT, 1, 2);

      expect(diff.added).toBeDefined();
      expect(diff.removed).toBeDefined();
      expect(diff.modified).toBeDefined();
      // Version 2 added a Slack node
      expect(diff.added.length).toBeGreaterThan(0);
    });

    it('should show no diff for same version', async () => {
      const diff = await service.diffVersions(WORKFLOW_ID, TENANT, 1, 1);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });
  });

  describe('Rollback', () => {
    it('should rollback to a previous version', async () => {
      const result = await service.rollbackToVersion(WORKFLOW_ID, TENANT, 1, 'user-1');

      // Rollback creates a NEW version with the old definition
      expect(result.versionNumber).toBe(3);
      expect(result.definition.nodes).toHaveLength(1);
      expect(result.changeDescription).toContain('Rollback to version 1');
    });

    it('should update the workflow definition after rollback', async () => {
      const workflow = await db.workflows.getById(WORKFLOW_ID, TENANT);
      expect(workflow.definitionJson.nodes).toHaveLength(1);
    });

    it('should reject rollback to non-existent version', async () => {
      await expect(
        service.rollbackToVersion(WORKFLOW_ID, TENANT, 999, 'user-1'),
      ).rejects.toThrow(/version not found/i);
    });
  });

  describe('Version Limits', () => {
    it('should enforce maximum version count per workflow', async () => {
      // This test depends on MAX_WORKFLOW_VERSIONS config
      const maxVersions = 100;
      const history = await service.listVersions(WORKFLOW_ID, TENANT);
      expect(history.length).toBeLessThanOrEqual(maxVersions);
    });
  });
});
```

#### 2. Implement the feature

**Migration:** `packages/db/migrations/022_workflow_versions.sql`

```sql
CREATE TABLE workflow_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  definition        JSONB NOT NULL,
  change_description TEXT,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(workflow_id, version_number)
);

CREATE INDEX idx_versions_workflow ON workflow_versions(workflow_id, version_number DESC);
CREATE INDEX idx_versions_tenant ON workflow_versions(tenant_id);
```

**File:** `packages/api/src/services/workflow-versioning-service.ts`

```typescript
import { randomUUID } from 'node:crypto';
import { diff as deepDiff } from 'deep-diff';
import type { Pool } from 'pg';

interface VersionSaveInput {
  workflowId: string;
  tenantId: string;
  userId: string;
  definition: Record<string, unknown>;
  changeDescription?: string;
}

interface WorkflowVersion {
  id: string;
  workflowId: string;
  tenantId: string;
  versionNumber: number;
  definition: Record<string, unknown>;
  changeDescription: string | null;
  createdBy: string;
  createdAt: Date;
}

interface VersionDiff {
  added: DiffEntry[];
  removed: DiffEntry[];
  modified: DiffEntry[];
}

interface DiffEntry {
  path: string;
  kind: string;
  lhs?: unknown;
  rhs?: unknown;
}

export class WorkflowVersioningService {
  private maxVersions: number;

  constructor(private readonly db: Pool) {
    this.maxVersions = parseInt(process.env.MAX_WORKFLOW_VERSIONS ?? '100', 10);
  }

  async saveVersion(input: VersionSaveInput): Promise<WorkflowVersion> {
    const { workflowId, tenantId, userId, definition, changeDescription } = input;

    // Get next version number
    const lastVersion = await this.db.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM workflow_versions WHERE workflow_id = $1 AND tenant_id = $2`,
      [workflowId, tenantId],
    );
    const nextVersion = lastVersion.rows[0].max_version + 1;

    // Insert new version (copy-on-write: full snapshot)
    const id = randomUUID();
    const result = await this.db.query(
      `INSERT INTO workflow_versions (id, workflow_id, tenant_id, version_number, definition, change_description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, workflowId, tenantId, nextVersion, JSON.stringify(definition), changeDescription ?? null, userId],
    );

    // Update current workflow definition
    await this.db.query(
      `UPDATE workflows SET definition_json = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(definition), workflowId, tenantId],
    );

    // Prune old versions if over limit
    await this.pruneOldVersions(workflowId, tenantId);

    return this.mapRow(result.rows[0]);
  }

  async getVersion(workflowId: string, tenantId: string, versionNumber: number): Promise<WorkflowVersion> {
    const result = await this.db.query(
      `SELECT * FROM workflow_versions
       WHERE workflow_id = $1 AND tenant_id = $2 AND version_number = $3`,
      [workflowId, tenantId, versionNumber],
    );

    if (result.rows.length === 0) {
      throw new Error('Version not found');
    }

    return this.mapRow(result.rows[0]);
  }

  async listVersions(workflowId: string, tenantId: string): Promise<WorkflowVersion[]> {
    const result = await this.db.query(
      `SELECT * FROM workflow_versions
       WHERE workflow_id = $1 AND tenant_id = $2
       ORDER BY version_number DESC`,
      [workflowId, tenantId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async diffVersions(
    workflowId: string,
    tenantId: string,
    versionA: number,
    versionB: number,
  ): Promise<VersionDiff> {
    const [a, b] = await Promise.all([
      this.getVersion(workflowId, tenantId, versionA),
      this.getVersion(workflowId, tenantId, versionB),
    ]);

    const differences = deepDiff(a.definition, b.definition) ?? [];

    const added: DiffEntry[] = [];
    const removed: DiffEntry[] = [];
    const modified: DiffEntry[] = [];

    for (const d of differences) {
      const entry: DiffEntry = {
        path: (d.path ?? []).join('.'),
        kind: d.kind,
        lhs: 'lhs' in d ? d.lhs : undefined,
        rhs: 'rhs' in d ? d.rhs : undefined,
      };

      switch (d.kind) {
        case 'N': added.push(entry); break;
        case 'D': removed.push(entry); break;
        case 'E': modified.push(entry); break;
        case 'A': modified.push(entry); break;
      }
    }

    return { added, removed, modified };
  }

  async rollbackToVersion(
    workflowId: string,
    tenantId: string,
    targetVersion: number,
    userId: string,
  ): Promise<WorkflowVersion> {
    const target = await this.getVersion(workflowId, tenantId, targetVersion).catch(() => {
      throw new Error('Version not found');
    });

    return this.saveVersion({
      workflowId,
      tenantId,
      userId,
      definition: target.definition,
      changeDescription: `Rollback to version ${targetVersion}`,
    });
  }

  private async pruneOldVersions(workflowId: string, tenantId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM workflow_versions
       WHERE workflow_id = $1 AND tenant_id = $2
       AND version_number NOT IN (
         SELECT version_number FROM workflow_versions
         WHERE workflow_id = $1 AND tenant_id = $2
         ORDER BY version_number DESC
         LIMIT $3
       )`,
      [workflowId, tenantId, this.maxVersions],
    );
  }

  private mapRow(row: Record<string, unknown>): WorkflowVersion {
    return {
      id: row.id as string,
      workflowId: row.workflow_id as string,
      tenantId: row.tenant_id as string,
      versionNumber: row.version_number as number,
      definition: row.definition as Record<string, unknown>,
      changeDescription: row.change_description as string | null,
      createdBy: row.created_by as string,
      createdAt: row.created_at as Date,
    };
  }
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "WorkflowVersioningService"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `UNIQUE constraint on version_number` | Ensure `UNIQUE(workflow_id, version_number)` constraint exists in migration |
| `deep-diff not found` | Run `pnpm --filter @r360/api add deep-diff && pnpm --filter @r360/api add -D @types/deep-diff` |
| `Rollback does not update workflow` | Verify `saveVersion` calls `UPDATE workflows SET definition_json` |
| `Version history returns wrong tenant` | Verify WHERE clause includes `AND tenant_id = $2` |

### Success Criteria
- [ ] Copy-on-write: each save creates a new version with full definition snapshot
- [ ] Version numbers increment sequentially per workflow
- [ ] Version history listed in descending order (newest first)
- [ ] Cross-tenant version access blocked
- [ ] Diff view shows added, removed, and modified elements between versions
- [ ] Rollback creates a new version with the target version's definition
- [ ] Workflow definition updated after rollback
- [ ] Version pruning enforces maximum count

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "versioning|version"
# Expected: All versioning tests pass
```

---

## Step 6.4: Theming & White-Label

### Objective
Implement per-tenant theming and white-label branding using Workflow Builder's built-in theming support. Tenants can configure their own logo, colors, fonts, and branding. Configuration is stored in the tenant settings and applied at runtime.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/theming/tenant-theming.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ThemingService, TenantTheme } from '../../services/theming-service';
import { createTestDb, TestDb } from '../helpers/test-db';

describe('ThemingService', () => {
  let db: TestDb;
  let service: ThemingService;

  const TENANT = 'tenant-theming';

  beforeAll(async () => {
    db = await createTestDb();
    service = new ThemingService(db);
    await db.tenants.create({ id: TENANT, name: 'Themed Tenant', slug: 'themed', plan: 'enterprise' });
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('Theme Configuration', () => {
    it('should return default theme when no custom theme is set', async () => {
      const theme = await service.getTheme(TENANT);

      expect(theme.primaryColor).toBe('#2563EB');
      expect(theme.logo).toBeNull();
      expect(theme.appName).toBe('R360 Flow');
      expect(theme.fontFamily).toBe('Inter, sans-serif');
    });

    it('should save and retrieve a custom theme', async () => {
      const customTheme: Partial<TenantTheme> = {
        primaryColor: '#FF5722',
        secondaryColor: '#795548',
        logo: 'https://cdn.example.com/logo.svg',
        favicon: 'https://cdn.example.com/favicon.ico',
        appName: 'Acme Workflows',
        fontFamily: 'Roboto, sans-serif',
      };

      await service.setTheme(TENANT, customTheme);
      const theme = await service.getTheme(TENANT);

      expect(theme.primaryColor).toBe('#FF5722');
      expect(theme.secondaryColor).toBe('#795548');
      expect(theme.logo).toBe('https://cdn.example.com/logo.svg');
      expect(theme.appName).toBe('Acme Workflows');
    });

    it('should merge partial updates with existing theme', async () => {
      await service.setTheme(TENANT, { primaryColor: '#009688' });
      const theme = await service.getTheme(TENANT);

      expect(theme.primaryColor).toBe('#009688');
      // Previous values preserved
      expect(theme.appName).toBe('Acme Workflows');
      expect(theme.logo).toBe('https://cdn.example.com/logo.svg');
    });

    it('should validate hex color format', async () => {
      await expect(
        service.setTheme(TENANT, { primaryColor: 'not-a-color' }),
      ).rejects.toThrow(/invalid color/i);
    });

    it('should validate logo URL format', async () => {
      await expect(
        service.setTheme(TENANT, { logo: 'not-a-url' }),
      ).rejects.toThrow(/invalid url/i);
    });
  });

  describe('CSS Variable Generation', () => {
    it('should generate CSS custom properties from theme', async () => {
      const css = await service.generateCSSVariables(TENANT);

      expect(css).toContain('--r360-primary:');
      expect(css).toContain('--r360-font-family:');
      expect(css).toContain(':root');
    });
  });

  describe('White-Label Control', () => {
    it('should allow hiding powered-by branding on enterprise plan', async () => {
      await service.setTheme(TENANT, { hidePoweredBy: true });
      const theme = await service.getTheme(TENANT);
      expect(theme.hidePoweredBy).toBe(true);
    });

    it('should NOT allow hiding powered-by on free plan', async () => {
      const FREE_TENANT = 'tenant-free-theming';
      await db.tenants.create({ id: FREE_TENANT, name: 'Free', slug: 'free-thm', plan: 'free' });

      await expect(
        service.setTheme(FREE_TENANT, { hidePoweredBy: true }),
      ).rejects.toThrow(/enterprise plan required/i);
    });
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/services/theming-service.ts`

```typescript
import type { Pool } from 'pg';

export interface TenantTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  logo: string | null;
  favicon: string | null;
  appName: string;
  fontFamily: string;
  borderRadius: string;
  hidePoweredBy: boolean;
}

const DEFAULT_THEME: TenantTheme = {
  primaryColor: '#2563EB',
  secondaryColor: '#64748B',
  accentColor: '#F59E0B',
  backgroundColor: '#F8FAFC',
  surfaceColor: '#FFFFFF',
  textColor: '#1E293B',
  logo: null,
  favicon: null,
  appName: 'R360 Flow',
  fontFamily: 'Inter, sans-serif',
  borderRadius: '8px',
  hidePoweredBy: false,
};

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
const URL_REGEX = /^https?:\/\/.+/;

export class ThemingService {
  constructor(private readonly db: Pool) {}

  async getTheme(tenantId: string): Promise<TenantTheme> {
    const result = await this.db.query(
      `SELECT settings FROM tenants WHERE id = $1`,
      [tenantId],
    );

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    const settings = result.rows[0].settings ?? {};
    const customTheme = settings.theme ?? {};

    return { ...DEFAULT_THEME, ...customTheme };
  }

  async setTheme(tenantId: string, updates: Partial<TenantTheme>): Promise<void> {
    // Validate colors
    const colorFields: (keyof TenantTheme)[] = [
      'primaryColor', 'secondaryColor', 'accentColor',
      'backgroundColor', 'surfaceColor', 'textColor',
    ];
    for (const field of colorFields) {
      if (updates[field] !== undefined && !HEX_COLOR_REGEX.test(updates[field] as string)) {
        throw new Error(`Invalid color format for ${field}: must be hex color (e.g., #FF5722)`);
      }
    }

    // Validate URLs
    const urlFields: (keyof TenantTheme)[] = ['logo', 'favicon'];
    for (const field of urlFields) {
      const value = updates[field];
      if (value !== undefined && value !== null && !URL_REGEX.test(value as string)) {
        throw new Error(`Invalid URL format for ${field}`);
      }
    }

    // Check plan for white-label features
    if (updates.hidePoweredBy === true) {
      const tenant = await this.db.query(`SELECT plan FROM tenants WHERE id = $1`, [tenantId]);
      if (tenant.rows[0]?.plan !== 'enterprise') {
        throw new Error('Enterprise plan required to hide powered-by branding');
      }
    }

    // Merge with existing theme
    const currentTheme = await this.getTheme(tenantId);
    const mergedTheme = { ...currentTheme, ...updates };

    await this.db.query(
      `UPDATE tenants SET settings = settings || jsonb_build_object('theme', $1::jsonb), updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(mergedTheme), tenantId],
    );
  }

  async generateCSSVariables(tenantId: string): Promise<string> {
    const theme = await this.getTheme(tenantId);

    return `:root {
  --r360-primary: ${theme.primaryColor};
  --r360-secondary: ${theme.secondaryColor};
  --r360-accent: ${theme.accentColor};
  --r360-bg: ${theme.backgroundColor};
  --r360-surface: ${theme.surfaceColor};
  --r360-text: ${theme.textColor};
  --r360-font-family: ${theme.fontFamily};
  --r360-border-radius: ${theme.borderRadius};
}`;
  }
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "ThemingService"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `settings column is NULL` | Ensure `tenants` table has `settings JSONB DEFAULT '{}'` |
| `jsonb_build_object not found` | Ensure PostgreSQL >= 9.4. Use `||` operator for JSONB merge |
| `Plan check fails` | Verify tenant seed data includes `plan` field |

### Success Criteria
- [ ] Default theme returned when no custom theme is set
- [ ] Custom theme saved and retrieved correctly
- [ ] Partial theme updates merged with existing values
- [ ] Hex color validation enforced
- [ ] URL validation enforced for logo and favicon
- [ ] CSS custom properties generated from theme
- [ ] White-label (hide powered-by) restricted to enterprise plan

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "theming|theme"
# Expected: All theming tests pass
```

---

## Step 6.5: Documentation & API Reference

### Objective
Build OpenAPI/Swagger API documentation served at `/api/docs`, generate a developer guide, and create user-facing documentation. All API endpoints must be documented with request/response schemas, authentication requirements, and example payloads.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/docs/api-documentation.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app';
import { Express } from 'express';

describe('API Documentation', () => {
  let app: Express;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
  });

  describe('OpenAPI/Swagger', () => {
    it('should serve Swagger UI at /api/docs', async () => {
      const res = await request(app).get('/api/docs/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('swagger');
    });

    it('should serve OpenAPI JSON spec at /api/docs/openapi.json', async () => {
      const res = await request(app).get('/api/docs/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.0');
      expect(res.body.info.title).toBe('R360 Flow API');
    });

    it('should document all workflow endpoints', async () => {
      const res = await request(app).get('/api/docs/openapi.json');
      const paths = Object.keys(res.body.paths);

      expect(paths).toContain('/api/workflows');
      expect(paths).toContain('/api/workflows/{id}');
      expect(paths).toContain('/api/workflows/{id}/execute');
    });

    it('should document all execution endpoints', async () => {
      const res = await request(app).get('/api/docs/openapi.json');
      const paths = Object.keys(res.body.paths);

      expect(paths).toContain('/api/executions');
      expect(paths).toContain('/api/executions/{id}');
    });

    it('should document authentication requirements', async () => {
      const res = await request(app).get('/api/docs/openapi.json');
      expect(res.body.components.securitySchemes.bearerAuth).toBeDefined();
      expect(res.body.components.securitySchemes.bearerAuth.type).toBe('http');
      expect(res.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });

    it('should include request/response schemas', async () => {
      const res = await request(app).get('/api/docs/openapi.json');
      const schemas = res.body.components.schemas;

      expect(schemas.Workflow).toBeDefined();
      expect(schemas.Execution).toBeDefined();
      expect(schemas.Credential).toBeDefined();
      expect(schemas.Error).toBeDefined();
    });
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/docs/openapi-spec.ts`

```typescript
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'R360 Flow API',
      version: '1.0.0',
      description: 'Multi-tenant workflow automation platform API. All endpoints require tenant-scoped authentication.',
      contact: { name: 'R360 Flow Support', email: 'support@r360flow.com' },
      license: { name: 'Proprietary' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
      { url: 'https://api.r360flow.com', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from auth provider (Clerk/Auth0). Contains tenant_id claim.',
        },
      },
      schemas: {
        Workflow: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            name: { type: 'string', maxLength: 255 },
            definitionJson: { type: 'object', description: 'n8n-compatible workflow definition' },
            isActive: { type: 'boolean' },
            createdBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Execution: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            workflowId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['pending', 'running', 'success', 'error', 'cancelled'] },
            startedAt: { type: 'string', format: 'date-time' },
            finishedAt: { type: 'string', format: 'date-time', nullable: true },
            error: { type: 'string', nullable: true },
          },
        },
        Credential: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
          description: 'Credential metadata. Encrypted data is never exposed via API.',
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object', nullable: true },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
};

export const openapiSpec = swaggerJsdoc(options);
```

**File:** `packages/api/src/docs/setup-docs.ts`

```typescript
import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from './openapi-spec';

export function setupApiDocs(app: Express): void {
  if (process.env.API_DOCS_ENABLED !== 'true' && process.env.NODE_ENV === 'production') {
    return;
  }

  const docsPath = process.env.API_DOCS_PATH || '/api/docs';

  app.get(`${docsPath}/openapi.json`, (_req, res) => {
    res.json(openapiSpec);
  });

  app.use(docsPath, swaggerUi.serve, swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'R360 Flow API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "API Documentation"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `swagger-ui-express not found` | Run `pnpm --filter @r360/api add swagger-ui-express swagger-jsdoc` |
| `/api/docs returns 404` | Ensure `setupApiDocs(app)` is called during app initialization |
| `OpenAPI spec missing paths` | Add JSDoc annotations to route files or define paths in the spec object |

### Success Criteria
- [ ] Swagger UI accessible at `/api/docs`
- [ ] OpenAPI JSON spec at `/api/docs/openapi.json`
- [ ] All workflow, execution, and credential endpoints documented
- [ ] Authentication requirements documented
- [ ] Request/response schemas defined
- [ ] API docs disabled in production unless explicitly enabled

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "documentation|docs"
# Expected: All docs tests pass

# Visit http://localhost:3000/api/docs in browser
```

---

## Step 6.6: Monitoring & Alerting

### Objective
Integrate Datadog and Sentry for application monitoring, error tracking, and alerting. Build a health dashboard endpoint, define alert rules for critical scenarios (execution failures, high latency, queue depth, tenant limit breaches), and expose Prometheus-compatible metrics.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/monitoring/health-monitoring.test.ts`

```typescript
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app';
import { Express } from 'express';
import { HealthCheckService } from '../../services/health-check-service';
import { MetricsService } from '../../services/metrics-service';
import { AlertRuleEngine } from '../../services/alert-rule-engine';

describe('Health & Monitoring', () => {
  let app: Express;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
  });

  describe('Health Endpoint', () => {
    it('should return health status with component checks', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.components.database).toBeDefined();
      expect(res.body.components.redis).toBeDefined();
      expect(res.body.components.executionEngine).toBeDefined();
      expect(res.body.uptime).toBeGreaterThan(0);
      expect(res.body.version).toBeDefined();
    });

    it('should return degraded status when a component is unhealthy', async () => {
      // This test requires mocking a failed component
      const healthService = new HealthCheckService({
        db: { query: vi.fn().mockRejectedValue(new Error('Connection refused')) } as any,
        redis: { ping: vi.fn().mockResolvedValue('PONG') } as any,
      });

      const status = await healthService.check();
      expect(status.status).toBe('degraded');
      expect(status.components.database.status).toBe('unhealthy');
    });
  });

  describe('Metrics Endpoint', () => {
    it('should expose Prometheus-compatible metrics', async () => {
      const res = await request(app).get('/api/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('r360_http_requests_total');
      expect(res.text).toContain('r360_execution_duration_seconds');
      expect(res.text).toContain('r360_active_executions');
      expect(res.text).toContain('r360_queue_depth');
    });
  });

  describe('AlertRuleEngine', () => {
    it('should trigger alert when execution failure rate exceeds threshold', async () => {
      const mockNotifier = { send: vi.fn().mockResolvedValue(undefined) };
      const engine = new AlertRuleEngine(mockNotifier);

      engine.addRule({
        name: 'high_failure_rate',
        condition: (metrics) => metrics.executionFailureRate > 0.1,
        severity: 'critical',
        message: 'Execution failure rate exceeds 10%',
      });

      await engine.evaluate({ executionFailureRate: 0.15, queueDepth: 5 });

      expect(mockNotifier.send).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'critical',
          rule: 'high_failure_rate',
        }),
      );
    });

    it('should NOT trigger alert when metrics are within thresholds', async () => {
      const mockNotifier = { send: vi.fn() };
      const engine = new AlertRuleEngine(mockNotifier);

      engine.addRule({
        name: 'high_failure_rate',
        condition: (metrics) => metrics.executionFailureRate > 0.1,
        severity: 'critical',
        message: 'Execution failure rate exceeds 10%',
      });

      await engine.evaluate({ executionFailureRate: 0.02, queueDepth: 5 });

      expect(mockNotifier.send).not.toHaveBeenCalled();
    });

    it('should support multiple alert rules', async () => {
      const mockNotifier = { send: vi.fn().mockResolvedValue(undefined) };
      const engine = new AlertRuleEngine(mockNotifier);

      engine.addRule({
        name: 'high_queue_depth',
        condition: (metrics) => metrics.queueDepth > 100,
        severity: 'warning',
        message: 'Queue depth exceeds 100',
      });

      engine.addRule({
        name: 'high_latency',
        condition: (metrics) => metrics.p99LatencyMs > 5000,
        severity: 'critical',
        message: 'P99 latency exceeds 5 seconds',
      });

      await engine.evaluate({ executionFailureRate: 0.01, queueDepth: 150, p99LatencyMs: 6000 });

      expect(mockNotifier.send).toHaveBeenCalledTimes(2);
    });
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/services/health-check-service.ts`

```typescript
import type { Pool } from 'pg';
import type Redis from 'ioredis';

interface ComponentHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    executionEngine: ComponentHealth;
  };
  uptime: number;
  version: string;
  timestamp: string;
}

export class HealthCheckService {
  private startTime: number;

  constructor(private readonly deps: { db: Pool; redis: Redis }) {
    this.startTime = Date.now();
  }

  async check(): Promise<HealthStatus> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const executionEngine: ComponentHealth = {
      status: database.status === 'healthy' && redis.status === 'healthy' ? 'healthy' : 'unhealthy',
      latencyMs: 0,
    };

    const allHealthy = [database, redis, executionEngine].every(c => c.status === 'healthy');
    const allUnhealthy = [database, redis, executionEngine].every(c => c.status === 'unhealthy');

    return {
      status: allHealthy ? 'healthy' : allUnhealthy ? 'unhealthy' : 'degraded',
      components: { database, redis, executionEngine },
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.SENTRY_RELEASE ?? '0.0.0-dev',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.deps.db.query('SELECT 1');
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.deps.redis.ping();
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
```

**File:** `packages/api/src/services/metrics-service.ts`

```typescript
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export class MetricsService {
  readonly registry: Registry;

  readonly httpRequestsTotal: Counter;
  readonly executionDuration: Histogram;
  readonly activeExecutions: Gauge;
  readonly queueDepth: Gauge;
  readonly executionErrors: Counter;

  constructor() {
    this.registry = new Registry();

    this.httpRequestsTotal = new Counter({
      name: 'r360_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.executionDuration = new Histogram({
      name: 'r360_execution_duration_seconds',
      help: 'Workflow execution duration in seconds',
      labelNames: ['tenant_id', 'status'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
      registers: [this.registry],
    });

    this.activeExecutions = new Gauge({
      name: 'r360_active_executions',
      help: 'Currently running workflow executions',
      labelNames: ['tenant_id'],
      registers: [this.registry],
    });

    this.queueDepth = new Gauge({
      name: 'r360_queue_depth',
      help: 'Number of pending executions in queue',
      labelNames: ['priority'],
      registers: [this.registry],
    });

    this.executionErrors = new Counter({
      name: 'r360_execution_errors_total',
      help: 'Total workflow execution errors',
      labelNames: ['tenant_id', 'error_type'],
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  async getContentType(): Promise<string> {
    return this.registry.contentType;
  }
}
```

**File:** `packages/api/src/services/alert-rule-engine.ts`

```typescript
interface AlertRule {
  name: string;
  condition: (metrics: Record<string, number>) => boolean;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  cooldownMs?: number;
}

interface AlertNotifier {
  send: (alert: { rule: string; severity: string; message: string; timestamp: string }) => Promise<void>;
}

export class AlertRuleEngine {
  private rules: AlertRule[] = [];
  private lastFired: Map<string, number> = new Map();

  constructor(private readonly notifier: AlertNotifier) {}

  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  async evaluate(metrics: Record<string, number>): Promise<void> {
    const now = Date.now();

    for (const rule of this.rules) {
      if (!rule.condition(metrics)) continue;

      const lastFiredAt = this.lastFired.get(rule.name) ?? 0;
      const cooldown = rule.cooldownMs ?? 300_000; // 5 min default

      if (now - lastFiredAt < cooldown) continue;

      this.lastFired.set(rule.name, now);

      await this.notifier.send({
        rule: rule.name,
        severity: rule.severity,
        message: rule.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "Health|Monitoring|Alert"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `prom-client not found` | Run `pnpm --filter @r360/api add prom-client` |
| `Health endpoint returns 404` | Register health route: `app.get('/api/health', ...)` |
| `Metrics endpoint empty` | Ensure MetricsService is instantiated and counters are registered |
| `Alert cooldown interferes with tests` | Set `cooldownMs: 0` in test rules |

### Success Criteria
- [ ] Health endpoint returns component-level status (database, Redis, execution engine)
- [ ] Degraded status when any component fails
- [ ] Prometheus-compatible metrics exposed at `/api/metrics`
- [ ] HTTP request, execution duration, active execution, and queue depth metrics tracked
- [ ] Alert rule engine triggers notifications when thresholds exceeded
- [ ] Alert cooldown prevents duplicate notifications

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "health|metrics|alert"
# Expected: All monitoring tests pass

curl http://localhost:3000/api/health
# Expected: {"status":"healthy","components":{...}}

curl http://localhost:3000/api/metrics
# Expected: Prometheus-format metrics
```

---

## Step 6.7: Production Load Testing

### Objective
Build a comprehensive load test suite that validates the platform under production-like conditions: multiple tenants executing workflows concurrently, queue saturation, webhook throughput, and API response times. Establish performance benchmarks and regression thresholds.

### TDD Implementation

#### 1. Write the load test suite

**File:** `packages/api/src/__tests__/load/multi-tenant-load.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Production Load Tests', () => {
  const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:3000';
  const TENANT_COUNT = 10;
  const WORKFLOWS_PER_TENANT = 5;
  const CONCURRENT_EXECUTIONS = 50;

  let tenantTokens: string[] = [];

  beforeAll(async () => {
    // Provision test tenants
    for (let i = 0; i < TENANT_COUNT; i++) {
      const res = await fetch(`${BASE_URL}/api/test/provision-tenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `load-tenant-${i}`, plan: 'pro' }),
      });
      const data = await res.json();
      tenantTokens.push(data.token);
    }
  });

  afterAll(async () => {
    // Cleanup test tenants
    for (const token of tenantTokens) {
      await fetch(`${BASE_URL}/api/test/cleanup-tenant`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  it('should handle concurrent workflow CRUD across tenants', async () => {
    const start = Date.now();
    const operations: Promise<Response>[] = [];

    for (const token of tenantTokens) {
      for (let j = 0; j < WORKFLOWS_PER_TENANT; j++) {
        operations.push(
          fetch(`${BASE_URL}/api/workflows`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: `Load Test Workflow ${j}`,
              definition: { nodes: [{ id: 'trigger', type: 'webhook' }], connections: {} },
            }),
          }),
        );
      }
    }

    const responses = await Promise.all(operations);
    const elapsed = Date.now() - start;

    const successCount = responses.filter(r => r.status === 201).length;
    const totalOps = TENANT_COUNT * WORKFLOWS_PER_TENANT;

    expect(successCount).toBe(totalOps);
    expect(elapsed).toBeLessThan(30_000); // 30s for 50 operations

    console.log(`CRUD benchmark: ${totalOps} operations in ${elapsed}ms (${Math.round(totalOps / (elapsed / 1000))} ops/sec)`);
  }, 60_000);

  it('should handle concurrent executions without degradation', async () => {
    const executions: Promise<Response>[] = [];

    for (let i = 0; i < CONCURRENT_EXECUTIONS; i++) {
      const tokenIndex = i % tenantTokens.length;
      executions.push(
        fetch(`${BASE_URL}/api/workflows/wf-load-${tokenIndex}/execute`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tenantTokens[tokenIndex]}` },
        }),
      );
    }

    const start = Date.now();
    const responses = await Promise.all(executions);
    const elapsed = Date.now() - start;

    const accepted = responses.filter(r => r.status === 202).length;
    const rateLimited = responses.filter(r => r.status === 429).length;

    // All should be either accepted or rate limited (no errors)
    expect(accepted + rateLimited).toBe(CONCURRENT_EXECUTIONS);
    expect(elapsed).toBeLessThan(60_000); // 60s for 50 concurrent

    console.log(`Execution benchmark: ${accepted} accepted, ${rateLimited} rate-limited in ${elapsed}ms`);
  }, 120_000);

  it('should maintain API response times under p95 < 500ms', async () => {
    const latencies: number[] = [];

    for (let i = 0; i < 100; i++) {
      const token = tenantTokens[i % tenantTokens.length];
      const start = Date.now();
      await fetch(`${BASE_URL}/api/workflows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      latencies.push(Date.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`Latency: p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`);

    expect(p95).toBeLessThan(500);
  }, 60_000);

  it('should maintain tenant isolation under load', async () => {
    // While load is happening, verify each tenant only sees their own data
    const results = await Promise.all(
      tenantTokens.map(async (token) => {
        const res = await fetch(`${BASE_URL}/api/workflows`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return res.json();
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const workflows = results[i] as { tenantId: string }[];
      const foreignWorkflows = workflows.filter(
        w => w.tenantId !== `load-tenant-${i}`,
      );
      expect(foreignWorkflows).toHaveLength(0);
    }
  }, 30_000);
});
```

**File:** `infrastructure/load-tests/k6-multi-tenant.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const executionLatency = new Trend('execution_latency');

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 VUs
    { duration: '2m', target: 50 },    // Sustain 50 VUs
    { duration: '1m', target: 100 },   // Peak at 100 VUs
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    errors: ['rate<0.01'],             // Less than 1% error rate
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const tenantId = `tenant-k6-${__VU % 10}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer test-token-${tenantId}`,
  };

  // List workflows
  const listRes = http.get(`${BASE_URL}/api/workflows`, { headers });
  check(listRes, { 'list 200': (r) => r.status === 200 });
  errorRate.add(listRes.status !== 200);

  // Create workflow
  const createRes = http.post(`${BASE_URL}/api/workflows`, JSON.stringify({
    name: `k6-workflow-${Date.now()}`,
    definition: { nodes: [], connections: {} },
  }), { headers });
  check(createRes, { 'create 201': (r) => r.status === 201 });

  // Execute workflow
  if (createRes.status === 201) {
    const wfId = JSON.parse(createRes.body).id;
    const start = Date.now();
    const execRes = http.post(`${BASE_URL}/api/workflows/${wfId}/execute`, null, { headers });
    executionLatency.add(Date.now() - start);
    check(execRes, { 'execute 202': (r) => r.status === 202 });
  }

  sleep(1);
}
```

#### 2. Run load tests

```bash
# Run vitest load tests
pnpm --filter @r360/api test -- --grep "Load Tests" --timeout 300000

# Run k6 load tests
k6 run infrastructure/load-tests/k6-multi-tenant.js --env BASE_URL=http://localhost:3000
```

#### 3. Performance benchmarks

| Metric | Target | Critical Threshold |
|--------|--------|--------------------|
| API p95 latency | < 200ms | < 500ms |
| API p99 latency | < 500ms | < 2000ms |
| Execution throughput | > 50 exec/sec | > 20 exec/sec |
| Concurrent tenants | 50+ | 10+ |
| Error rate | < 0.1% | < 1% |
| Queue depth (steady state) | < 50 | < 200 |
| Webhook throughput | > 100 req/sec | > 50 req/sec |

### Success Criteria
- [ ] Concurrent CRUD across 10 tenants completes within 30 seconds
- [ ] 50 concurrent executions handled without errors (accepted or rate-limited)
- [ ] API p95 latency under 500ms
- [ ] Tenant isolation maintained under load
- [ ] k6 thresholds pass (p95 < 500ms, error rate < 1%)

### Verification Commands
```bash
# Quick load test
pnpm --filter @r360/api test -- --grep "Load" --timeout 300000

# Full k6 suite
k6 run infrastructure/load-tests/k6-multi-tenant.js
# Expected: All thresholds pass
```

---

## Step 6.8: Production Readiness Checklist -- FINAL GATE

### Objective
This is the final gate before production launch. Every item must be verified. This step produces no new code -- it validates that ALL phases (1-6) are complete, all tests pass, security is audited, monitoring is active, documentation is published, and runbook templates are in place for operational scenarios.

### Production Readiness Checklist

#### Phase 1: Foundation (API Server + Database)
- [ ] API server starts without errors
- [ ] PostgreSQL schema migrated to latest version
- [ ] All tables include `tenant_id` column with proper foreign keys
- [ ] Row-level tenant isolation verified in every query
- [ ] Workflow CRUD endpoints functional (POST, GET, PUT, DELETE)
- [ ] Execution endpoints functional (POST trigger, GET list, GET detail)
- [ ] Credential CRUD with encryption at rest
- [ ] Auth middleware validates JWT on every protected route

#### Phase 2: UI Connection
- [ ] Workflow Builder loads and connects to API
- [ ] Workflows save/load from API (not local JSON)
- [ ] Auth flow (login, signup, tenant switching) functional
- [ ] JSON translation: DiagramModel <-> n8n WorkflowParameters round-trip verified

#### Phase 3: Execution Engine
- [ ] n8n DI container bootstraps without errors
- [ ] Node registry loads 400+ nodes from `n8n-nodes-base`
- [ ] `WorkflowExecute.run()` completes successfully for test workflows
- [ ] Tenant-scoped credentials resolved correctly
- [ ] Lifecycle hooks write execution results to DB
- [ ] Cardinal Rule verified: no n8n package modifications (check `package-lock.json`)

#### Phase 4: Execution Infrastructure
- [ ] BullMQ queue processes executions
- [ ] Per-tenant rate limiting enforced
- [ ] Execution sandboxing active for Code nodes
- [ ] Webhook routing functional (tenant-scoped paths)
- [ ] Scheduled workflows fire on time
- [ ] WebSocket real-time execution monitoring connected

#### Phase 5: Multi-Tenant Hardening
- [ ] Cross-tenant data isolation tests pass (19/19 comprehensive suite)
- [ ] Stripe billing integration active
- [ ] Usage metering tracks per-tenant metrics
- [ ] Plan-based limits enforced
- [ ] Tenant provisioning flow functional
- [ ] Admin dashboard accessible
- [ ] Security headers present (Helmet, CORS, CSP)
- [ ] API rate limiting active
- [ ] OWASP Top 10 checklist addressed

#### Phase 6: Polish & Launch
- [ ] Workflow templates gallery functional
- [ ] Error handling UX: retry, notifications, error detail view
- [ ] Workflow versioning: history, diff, rollback
- [ ] Theming and white-label configuration per tenant
- [ ] API documentation at `/api/docs`
- [ ] Health endpoint at `/api/health` returns all components healthy
- [ ] Prometheus metrics at `/api/metrics`
- [ ] Alert rules configured for critical scenarios
- [ ] Load tests pass with thresholds met

#### Security Audit
- [ ] `npm audit` returns zero critical or high vulnerabilities
- [ ] No secrets in source code (scan with `gitleaks` or `trufflehog`)
- [ ] All n8n packages pinned to specific versions in `package.json`
- [ ] HTTPS enforced (HSTS header present)
- [ ] CORS restricted to allowed origins
- [ ] JWT token expiration configured
- [ ] Per-tenant credential encryption verified
- [ ] Rate limiting active on all API and auth endpoints
- [ ] Error responses do not leak internal details

#### Monitoring & Observability
- [ ] Sentry DSN configured and error reporting active
- [ ] Datadog APM traces flowing
- [ ] Structured logging with tenant context in every log line
- [ ] Alert rules firing correctly (test with synthetic failures)
- [ ] Uptime monitoring configured (external check on `/api/health`)

#### Documentation
- [ ] API reference published at `/api/docs`
- [ ] User guide covers: creating workflows, managing credentials, viewing executions
- [ ] Developer docs cover: custom node creation, theming, API client usage
- [ ] Runbooks for operational scenarios (see below)

### Test Suite Verification

```bash
# Run ALL tests across all packages
pnpm test
# Expected: ALL TESTS PASS - zero failures

# Run security suite specifically
pnpm --filter @r360/api test -- --grep "COMPREHENSIVE SECURITY"
# Expected: 19/19 pass

# Run load tests
pnpm --filter @r360/api test -- --grep "Load Tests" --timeout 300000
# Expected: All thresholds met

# Run npm audit
pnpm audit --audit-level=high
# Expected: 0 high or critical vulnerabilities

# Verify no n8n modifications (Cardinal Rule)
git diff --name-only node_modules/n8n-workflow/ node_modules/n8n-core/ node_modules/n8n-nodes-base/
# Expected: No output (no modifications)

# Verify health
curl http://localhost:3000/api/health
# Expected: {"status":"healthy", ...}

# Verify docs
curl -s http://localhost:3000/api/docs/openapi.json | jq '.openapi'
# Expected: "3.0.0"
```

### Runbook Templates

#### Runbook 1: Tenant Provisioning

```markdown
# Tenant Provisioning Runbook

## When to Use
- New customer signs up
- Customer upgrades plan
- Customer needs manual provisioning

## Steps

### 1. Automated Provisioning (Normal Path)
Customer signs up via UI -> Auth provider creates user ->
Webhook triggers provisioning -> tenant row created ->
Stripe customer created -> Welcome email sent.

### 2. Manual Provisioning (Fallback)
```bash
# Create tenant in database
psql $DATABASE_URL -c "
  INSERT INTO tenants (id, name, slug, plan, settings, created_at)
  VALUES (gen_random_uuid(), 'Tenant Name', 'tenant-slug', 'pro', '{}', NOW())
  RETURNING id;
"

# Create owner user
psql $DATABASE_URL -c "
  INSERT INTO users (id, tenant_id, email, role, created_at)
  VALUES (gen_random_uuid(), '<tenant_id>', 'owner@example.com', 'owner', NOW());
"

# Create Stripe customer
stripe customers create --name="Tenant Name" --email="owner@example.com" \
  --metadata[tenantId]="<tenant_id>"

# Verify
curl http://localhost:3000/api/admin/tenants/<tenant_id> \
  -H "X-Admin-API-Key: $ADMIN_API_KEY"
```

### 3. Verification
- [ ] Tenant appears in admin dashboard
- [ ] Owner can log in and access workspace
- [ ] Plan limits correctly configured
- [ ] Stripe subscription active
```

#### Runbook 2: Execution Failure Investigation

```markdown
# Execution Failure Investigation Runbook

## When to Use
- Customer reports workflow not executing
- Alert fires for high execution failure rate
- Individual execution shows error status

## Steps

### 1. Identify the Failure
```bash
# Get execution details
curl "http://localhost:3000/api/executions/<execution_id>" \
  -H "X-Admin-API-Key: $ADMIN_API_KEY"

# Check execution steps for failed node
psql $DATABASE_URL -c "
  SELECT node_id, status, error, started_at, finished_at
  FROM execution_steps
  WHERE execution_id = '<execution_id>'
  ORDER BY started_at;
"
```

### 2. Common Failure Categories

| Category | Symptoms | Resolution |
|----------|----------|------------|
| Credential expired | OAuth token error | Reauthorize credential in UI |
| Rate limited by external API | 429 status in node output | Reduce execution frequency or upgrade external API plan |
| Timeout | Execution status stuck at 'running' | Check node for slow API calls; increase timeout |
| Node configuration error | Missing required parameter | Check node parameters in workflow definition |
| Queue saturation | Execution stays in 'pending' | Scale workers or check per-tenant queue limits |

### 3. Check Queue Health
```bash
# Check BullMQ queue depth
redis-cli LLEN "bull:workflow-execution:wait"

# Check active workers
redis-cli SCARD "bull:workflow-execution:workers"

# Check failed jobs
redis-cli LLEN "bull:workflow-execution:failed"
```

### 4. Retry
```bash
# Manual retry via API
curl -X POST "http://localhost:3000/api/executions/<execution_id>/retry" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Escalation
If issue persists after retry:
- Check Sentry for error details and stack traces
- Review Datadog APM trace for the execution
- Check n8n package version compatibility
```

#### Runbook 3: Scaling Workers

```markdown
# Scaling Workers Runbook

## When to Use
- Queue depth exceeds 200 for sustained period
- Execution latency p95 exceeds 5 seconds
- New enterprise tenant onboarded with high volume

## Steps

### 1. Assess Current State
```bash
# Check queue metrics
curl http://localhost:3000/api/metrics | grep r360_queue_depth

# Check active workers
curl http://localhost:3000/api/health | jq '.components'

# Check per-tenant queue depth
redis-cli KEYS "bull:workflow-execution:*:wait" | while read key; do
  echo "$key: $(redis-cli LLEN $key)"
done
```

### 2. Scale Horizontally (Kubernetes)
```bash
# Scale execution workers
kubectl scale deployment r360-execution-worker --replicas=10

# Verify new pods are ready
kubectl get pods -l app=r360-execution-worker

# Check worker registration
redis-cli SCARD "bull:workflow-execution:workers"
```

### 3. Scale Vertically (Per Worker)
```bash
# Increase concurrency per worker (env var)
kubectl set env deployment/r360-execution-worker \
  WORKER_CONCURRENCY=20 \
  MAX_MEMORY_MB=2048

# Restart workers
kubectl rollout restart deployment/r360-execution-worker
```

### 4. Per-Tenant Limits
```bash
# Increase limit for specific enterprise tenant
psql $DATABASE_URL -c "
  UPDATE tenants SET settings = settings ||
    '{\"maxConcurrentExecutions\": 100}'::jsonb
  WHERE id = '<tenant_id>';
"
```

### 5. Verify
- [ ] Queue depth returning to normal (< 50)
- [ ] p95 latency under 500ms
- [ ] No execution timeouts
- [ ] Worker CPU and memory within limits
```

#### Runbook 4: Database Maintenance

```markdown
# Database Maintenance Runbook

## When to Use
- Scheduled weekly maintenance
- Query performance degradation
- Storage approaching limits
- Before/after major migrations

## Steps

### 1. Routine Maintenance (Weekly)
```bash
# Analyze and vacuum all tables
psql $DATABASE_URL -c "VACUUM ANALYZE;"

# Check table sizes
psql $DATABASE_URL -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC;
"

# Check index health
psql $DATABASE_URL -c "
  SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
  FROM pg_stat_user_indexes
  ORDER BY idx_scan ASC LIMIT 20;
"
```

### 2. Execution Data Cleanup
```bash
# Archive old executions (older than 90 days)
psql $DATABASE_URL -c "
  -- Move to archive table
  INSERT INTO executions_archive
  SELECT * FROM executions
  WHERE finished_at < NOW() - INTERVAL '90 days';

  -- Delete archived rows
  DELETE FROM execution_steps
  WHERE execution_id IN (
    SELECT id FROM executions WHERE finished_at < NOW() - INTERVAL '90 days'
  );

  DELETE FROM executions WHERE finished_at < NOW() - INTERVAL '90 days';
"

# Verify row counts
psql $DATABASE_URL -c "
  SELECT 'executions' AS table_name, COUNT(*) FROM executions
  UNION ALL
  SELECT 'execution_steps', COUNT(*) FROM execution_steps
  UNION ALL
  SELECT 'workflow_versions', COUNT(*) FROM workflow_versions;
"
```

### 3. Connection Pool Health
```bash
# Check active connections
psql $DATABASE_URL -c "
  SELECT state, COUNT(*)
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state;
"

# Kill idle connections older than 10 minutes
psql $DATABASE_URL -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
    AND state_change < NOW() - INTERVAL '10 minutes'
    AND datname = current_database();
"
```

### 4. Backup Verification
```bash
# Verify latest backup
pg_dump $DATABASE_URL --format=custom --file=/backups/r360_$(date +%Y%m%d).dump

# Test restore to staging
pg_restore --dbname=$STAGING_DATABASE_URL /backups/r360_$(date +%Y%m%d).dump --clean --if-exists

# Verify row counts match
psql $STAGING_DATABASE_URL -c "SELECT COUNT(*) FROM tenants;"
```

### 5. Migration Safety
```bash
# Before running migrations
pg_dump $DATABASE_URL --format=custom --file=/backups/pre_migration_$(date +%Y%m%d_%H%M%S).dump

# Run migration
pnpm --filter @r360/db migrate:latest

# Verify
pnpm --filter @r360/db migrate:status

# If migration fails, restore
pg_restore --dbname=$DATABASE_URL /backups/pre_migration_*.dump --clean --if-exists
```
```

### Final Verification Script

**File:** `scripts/production-readiness-check.sh`

```bash
#!/bin/bash
set -e

echo "========================================"
echo " R360 Flow - Production Readiness Check"
echo "========================================"
echo ""

PASS=0
FAIL=0

check() {
  local description="$1"
  local command="$2"

  if eval "$command" > /dev/null 2>&1; then
    echo "[PASS] $description"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $description"
    FAIL=$((FAIL + 1))
  fi
}

echo "--- Test Suites ---"
check "All unit/integration tests pass" "pnpm test"
check "Security suite passes" "pnpm --filter @r360/api test -- --grep 'COMPREHENSIVE SECURITY' --timeout 60000"
check "No high/critical npm vulnerabilities" "pnpm audit --audit-level=high"

echo ""
echo "--- API Health ---"
check "Health endpoint returns healthy" "curl -sf http://localhost:3000/api/health | grep -q healthy"
check "API docs accessible" "curl -sf http://localhost:3000/api/docs/openapi.json | grep -q openapi"
check "Metrics endpoint accessible" "curl -sf http://localhost:3000/api/metrics | grep -q r360_"

echo ""
echo "--- Security ---"
check "HSTS header present" "curl -sI http://localhost:3000/api/health | grep -qi strict-transport-security"
check "X-Content-Type-Options present" "curl -sI http://localhost:3000/api/health | grep -qi x-content-type-options"
check "No X-Powered-By header" "! curl -sI http://localhost:3000/api/health | grep -qi x-powered-by"

echo ""
echo "--- Cardinal Rule ---"
check "No n8n source imports in our code" "! grep -r 'from.*n8n/' packages/ --include='*.ts' | grep -v node_modules | grep -v '.test.' | grep -v 'CLAUDE.md'"

echo ""
echo "========================================"
echo " Results: $PASS passed, $FAIL failed"
echo "========================================"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "PRODUCTION READINESS: NOT READY"
  echo "Fix all failures before deploying to production."
  exit 1
else
  echo ""
  echo "PRODUCTION READINESS: APPROVED"
  echo "All checks passed. Safe to deploy."
  exit 0
fi
```

### Success Criteria
- [ ] ALL phases (1-6) verified complete
- [ ] ALL test suites pass with zero failures
- [ ] Security audit clean (zero critical/high vulnerabilities)
- [ ] Monitoring active and alert rules firing
- [ ] Documentation published and accessible
- [ ] Runbooks created for: tenant provisioning, execution failure investigation, scaling workers, database maintenance
- [ ] Production readiness script passes all checks
- [ ] Cardinal Rule verified: no n8n package modifications

### Verification Commands
```bash
# Run the production readiness check
chmod +x scripts/production-readiness-check.sh
./scripts/production-readiness-check.sh
# Expected: "PRODUCTION READINESS: APPROVED"
```

---

## Phase Completion Checklist

- [ ] **Step 6.1**: Workflow templates gallery with global + per-tenant CRUD, import
- [ ] **Step 6.2**: Error handling UX with retry, auto-retry, notifications, error detail view
- [ ] **Step 6.3**: Workflow versioning with copy-on-write, history, diff view, rollback
- [ ] **Step 6.4**: Per-tenant theming and white-label branding configuration
- [ ] **Step 6.5**: OpenAPI/Swagger documentation at `/api/docs`
- [ ] **Step 6.6**: Health dashboard, Prometheus metrics, alert rule engine
- [ ] **Step 6.7**: Load tests pass with multi-tenant scale benchmarks met
- [ ] **Step 6.8**: Production readiness checklist ALL ITEMS verified
- [ ] All tests pass: `pnpm test` from repo root
- [ ] No direct n8n package modifications (Cardinal Rule)
- [ ] All new code has TypeScript types (no `any` in production code)
- [ ] Runbooks created and reviewed for operational scenarios

## Rollback Procedure

If Phase 6 introduces issues:

1. **Templates gallery broken**: Disable template routes:
   ```bash
   TEMPLATES_ENABLED=false
   # Template endpoints return 503; workflow CRUD unaffected
   ```

2. **Versioning causing save failures**: Bypass versioning:
   ```bash
   VERSIONING_ENABLED=false
   # Saves go directly to workflows table without creating versions
   ```

3. **Theming breaks UI rendering**: Reset to default theme:
   ```bash
   psql $DATABASE_URL -c "
     UPDATE tenants SET settings = settings - 'theme';
   "
   # All tenants revert to default R360 Flow theme
   ```

4. **API docs leaking sensitive info**: Disable docs:
   ```bash
   API_DOCS_ENABLED=false
   # /api/docs returns 404
   ```

5. **Monitoring causing performance overhead**: Disable non-essential monitoring:
   ```bash
   DD_APM_ENABLED=false
   SENTRY_ENABLED=false
   # Health endpoint still works; metrics collection paused
   ```

6. **Load test reveals critical performance issue**: Scale down and investigate:
   ```bash
   # Reduce worker concurrency
   kubectl set env deployment/r360-execution-worker WORKER_CONCURRENCY=2
   # Enable request queuing
   RATE_LIMIT_MAX_REQUESTS=20
   ```

7. **Full Phase 6 rollback**: Revert to Phase 5 state:
   - Remove template, versioning, and theming routes
   - Remove docs middleware
   - Remove metrics and alert services
   - All Phase 1-5 functionality continues working unchanged

---

## Cross-Phase Integration Notes

### From Phase 5
- Security test suite is a CI gate -- it runs before every production deployment
- Stripe billing data drives plan-based feature gating (theming, white-label)
- Admin dashboard extended with template usage metrics
- Audit logs capture template imports and version rollbacks

### From Phase 4
- BullMQ queue metrics feed into Prometheus and alert rules
- WebSocket connections deliver error notifications in real time
- Webhook throughput metrics added to load testing benchmarks

### From Phase 3
- `WorkflowExecute.run()` execution results feed into error handling service
- Lifecycle hooks extended to trigger error notifications on failure
- Node type descriptions used to generate API documentation schemas

### Launch Readiness
- All six phases verified by production readiness checklist
- Runbooks cover the four critical operational scenarios
- Monitoring and alerting provide visibility into production health
- Documentation enables self-service for developers and end users
- Load tests establish performance baselines for ongoing regression testing
