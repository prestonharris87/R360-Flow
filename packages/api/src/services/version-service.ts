import { randomUUID } from 'node:crypto';

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  tenantId: string;
  version: number;
  data: Record<string, unknown>;
  changelog?: string;
  createdBy?: string;
  createdAt: Date;
  tag?: string;
}

export interface VersionStore {
  save(version: WorkflowVersion): Promise<WorkflowVersion>;
  getById(id: string): Promise<WorkflowVersion | null>;
  getByWorkflowAndVersion(
    workflowId: string,
    version: number,
  ): Promise<WorkflowVersion | null>;
  listByWorkflow(
    workflowId: string,
    tenantId: string,
  ): Promise<WorkflowVersion[]>;
  getLatest(
    workflowId: string,
    tenantId: string,
  ): Promise<WorkflowVersion | null>;
  update(
    id: string,
    data: Partial<WorkflowVersion>,
  ): Promise<WorkflowVersion | null>;
}

export class VersionService {
  constructor(private store: VersionStore) {}

  async createVersion(params: {
    workflowId: string;
    tenantId: string;
    data: Record<string, unknown>;
    changelog?: string;
    createdBy?: string;
  }): Promise<WorkflowVersion> {
    const latest = await this.store.getLatest(
      params.workflowId,
      params.tenantId,
    );
    const version: WorkflowVersion = {
      id: randomUUID(),
      workflowId: params.workflowId,
      tenantId: params.tenantId,
      version: latest ? latest.version + 1 : 1,
      data: params.data,
      changelog: params.changelog,
      createdBy: params.createdBy,
      createdAt: new Date(),
    };
    return this.store.save(version);
  }

  async getVersion(id: string): Promise<WorkflowVersion | null> {
    return this.store.getById(id);
  }

  async listVersions(
    workflowId: string,
    tenantId: string,
  ): Promise<WorkflowVersion[]> {
    return this.store.listByWorkflow(workflowId, tenantId);
  }

  async getLatest(
    workflowId: string,
    tenantId: string,
  ): Promise<WorkflowVersion | null> {
    return this.store.getLatest(workflowId, tenantId);
  }

  async rollback(
    workflowId: string,
    tenantId: string,
    targetVersion: number,
  ): Promise<WorkflowVersion | null> {
    const target = await this.store.getByWorkflowAndVersion(
      workflowId,
      targetVersion,
    );
    if (!target || target.tenantId !== tenantId) return null;

    // Create new version with old data (copy-on-write)
    return this.createVersion({
      workflowId,
      tenantId,
      data: target.data,
      changelog: `Rolled back to version ${targetVersion}`,
    });
  }

  diff(
    versionA: WorkflowVersion,
    versionB: WorkflowVersion,
  ): { added: string[]; removed: string[]; changed: string[] } {
    const keysA = Object.keys(versionA.data);
    const keysB = Object.keys(versionB.data);

    const added = keysB.filter((k) => !keysA.includes(k));
    const removed = keysA.filter((k) => !keysB.includes(k));
    const changed = keysA.filter(
      (k) =>
        keysB.includes(k) &&
        JSON.stringify(versionA.data[k]) !== JSON.stringify(versionB.data[k]),
    );

    return { added, removed, changed };
  }

  async tagVersion(
    id: string,
    tag: string,
  ): Promise<WorkflowVersion | null> {
    return this.store.update(id, { tag });
  }
}
