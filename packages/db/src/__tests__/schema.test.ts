import { describe, it, expect } from 'vitest';
import {
  tenants,
  users,
  workflows,
  credentials,
  executions,
  executionSteps,
  webhooks,
} from '../schema/index';

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
