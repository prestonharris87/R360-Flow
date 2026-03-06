import { randomUUID } from 'node:crypto';

export interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  workflowData: Record<string, unknown>;
  isGlobal: boolean;
  tenantId: string | null; // null for global templates
  version: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateStore {
  create(template: TemplateRecord): Promise<TemplateRecord>;
  getById(id: string): Promise<TemplateRecord | null>;
  listGlobal(): Promise<TemplateRecord[]>;
  listByTenant(tenantId: string): Promise<TemplateRecord[]>;
  update(
    id: string,
    data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>>,
  ): Promise<TemplateRecord | null>;
  delete(id: string): Promise<boolean>;
}

export class TemplateService {
  constructor(private store: TemplateStore) {}

  async create(params: {
    name: string;
    description: string;
    category: string;
    workflowData: Record<string, unknown>;
    isGlobal?: boolean;
    tenantId: string | null;
    tags?: string[];
  }): Promise<TemplateRecord> {
    const template: TemplateRecord = {
      id: randomUUID(),
      name: params.name,
      description: params.description,
      category: params.category,
      workflowData: params.workflowData,
      isGlobal: params.isGlobal ?? false,
      tenantId: params.tenantId,
      version: 1,
      tags: params.tags ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return this.store.create(template);
  }

  async get(id: string): Promise<TemplateRecord | null> {
    return this.store.getById(id);
  }

  async list(tenantId: string): Promise<TemplateRecord[]> {
    const [global, tenant] = await Promise.all([
      this.store.listGlobal(),
      this.store.listByTenant(tenantId),
    ]);
    return [...global, ...tenant];
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        TemplateRecord,
        'name' | 'description' | 'category' | 'workflowData' | 'tags'
      >
    >,
  ): Promise<TemplateRecord | null> {
    const template = await this.store.getById(id);
    if (!template) return null;
    // Only allow updating own tenant's templates (not global unless admin)
    if (template.tenantId !== null && template.tenantId !== tenantId)
      return null;
    return this.store.update(id, { ...data, updatedAt: new Date() });
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const template = await this.store.getById(id);
    if (!template) return false;
    if (template.tenantId !== null && template.tenantId !== tenantId)
      return false;
    return this.store.delete(id);
  }

  async forkToWorkflow(
    id: string,
    _tenantId: string,
  ): Promise<Record<string, unknown> | null> {
    const template = await this.store.getById(id);
    if (!template) return null;
    // Return workflow data for the tenant to create their own workflow
    return {
      ...template.workflowData,
      name: `${template.name} (from template)`,
      forkedFromTemplate: id,
    };
  }
}
