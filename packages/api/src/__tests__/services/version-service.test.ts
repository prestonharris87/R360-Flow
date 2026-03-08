import { describe, it, expect, beforeEach } from 'vitest';
import { VersionService } from '../../services/version-service';
import type {
  VersionStore,
  WorkflowVersion,
} from '../../services/version-service';

/**
 * In-memory implementation of VersionStore for testing.
 */
class InMemoryVersionStore implements VersionStore {
  private versions: WorkflowVersion[] = [];

  async save(version: WorkflowVersion): Promise<WorkflowVersion> {
    this.versions.push({ ...version });
    return { ...version };
  }

  async getById(id: string): Promise<WorkflowVersion | null> {
    return this.versions.find((v) => v.id === id) ?? null;
  }

  async getByWorkflowAndVersion(
    workflowId: string,
    version: number,
  ): Promise<WorkflowVersion | null> {
    return (
      this.versions.find(
        (v) => v.workflowId === workflowId && v.version === version,
      ) ?? null
    );
  }

  async listByWorkflow(
    workflowId: string,
    tenantId: string,
  ): Promise<WorkflowVersion[]> {
    return this.versions.filter(
      (v) => v.workflowId === workflowId && v.tenantId === tenantId,
    );
  }

  async getLatest(
    workflowId: string,
    tenantId: string,
  ): Promise<WorkflowVersion | null> {
    const matching = this.versions
      .filter(
        (v) => v.workflowId === workflowId && v.tenantId === tenantId,
      )
      .sort((a, b) => b.version - a.version);
    return matching[0] ?? null;
  }

  async update(
    id: string,
    data: Partial<WorkflowVersion>,
  ): Promise<WorkflowVersion | null> {
    const idx = this.versions.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    this.versions[idx] = { ...this.versions[idx]!, ...data };
    return { ...this.versions[idx]! };
  }
}

describe('VersionService', () => {
  let store: InMemoryVersionStore;
  let service: VersionService;

  const TENANT_ID = 'tenant-001';
  const WORKFLOW_ID = 'workflow-abc';

  beforeEach(() => {
    store = new InMemoryVersionStore();
    service = new VersionService(store);
  });

  it('should create first version with version number 1', async () => {
    const result = await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { nodes: [], connections: {} },
      changelog: 'Initial version',
      createdBy: 'user-1',
    });

    expect(result.version).toBe(1);
    expect(result.workflowId).toBe(WORKFLOW_ID);
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.data).toEqual({ nodes: [], connections: {} });
    expect(result.changelog).toBe('Initial version');
    expect(result.createdBy).toBe('user-1');
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('should auto-increment version number', async () => {
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { step: 1 },
    });

    const v2 = await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { step: 2 },
    });

    const v3 = await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { step: 3 },
    });

    expect(v2.version).toBe(2);
    expect(v3.version).toBe(3);
  });

  it('should get version by id', async () => {
    const created = await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { name: 'test-workflow' },
    });

    const fetched = await service.getVersion(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.data).toEqual({ name: 'test-workflow' });
  });

  it('should list versions for a workflow', async () => {
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { v: 1 },
    });
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { v: 2 },
    });
    // Different workflow, same tenant -- should not appear
    await service.createVersion({
      workflowId: 'workflow-other',
      tenantId: TENANT_ID,
      data: { v: 1 },
    });

    const versions = await service.listVersions(WORKFLOW_ID, TENANT_ID);

    expect(versions).toHaveLength(2);
    expect(versions.every((v) => v.workflowId === WORKFLOW_ID)).toBe(true);
  });

  it('should get latest version', async () => {
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { v: 1 },
    });
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { v: 2 },
    });
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { v: 3 },
    });

    const latest = await service.getLatest(WORKFLOW_ID, TENANT_ID);

    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(3);
    expect(latest!.data).toEqual({ v: 3 });
  });

  it('should rollback to previous version (creates new version)', async () => {
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { nodes: ['A'] },
    });
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { nodes: ['A', 'B'] },
    });
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { nodes: ['A', 'B', 'C'] },
    });

    // Rollback to version 1
    const rolledBack = await service.rollback(WORKFLOW_ID, TENANT_ID, 1);

    expect(rolledBack).not.toBeNull();
    // Should be a new version (version 4), not overwrite version 1
    expect(rolledBack!.version).toBe(4);
    // Data should match version 1
    expect(rolledBack!.data).toEqual({ nodes: ['A'] });
  });

  it('should not rollback to non-existent version', async () => {
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { nodes: ['A'] },
    });

    const result = await service.rollback(WORKFLOW_ID, TENANT_ID, 99);

    expect(result).toBeNull();
  });

  it('should diff two versions', async () => {
    const v1 = await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: {
        nodes: ['A', 'B'],
        connections: { a: 1 },
        settings: { timeout: 30 },
      },
    });

    const v2 = await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: {
        nodes: ['A', 'B', 'C'],
        connections: { a: 1 },
        trigger: 'webhook',
      },
    });

    const result = service.diff(v1, v2);

    // 'trigger' is in v2 but not v1
    expect(result.added).toEqual(['trigger']);
    // 'settings' is in v1 but not v2
    expect(result.removed).toEqual(['settings']);
    // 'nodes' changed, 'connections' did not
    expect(result.changed).toEqual(['nodes']);
  });

  it('should tag a version', async () => {
    const created = await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { nodes: ['A'] },
    });

    const tagged = await service.tagVersion(created.id, 'production');

    expect(tagged).not.toBeNull();
    expect(tagged!.tag).toBe('production');
    expect(tagged!.id).toBe(created.id);
  });

  it('should include changelog on rollback', async () => {
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { nodes: ['A'] },
      changelog: 'First version',
    });
    await service.createVersion({
      workflowId: WORKFLOW_ID,
      tenantId: TENANT_ID,
      data: { nodes: ['A', 'B'] },
      changelog: 'Added node B',
    });

    const rolledBack = await service.rollback(WORKFLOW_ID, TENANT_ID, 1);

    expect(rolledBack).not.toBeNull();
    expect(rolledBack!.changelog).toBe('Rolled back to version 1');
  });
});
