import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateService } from '../../services/template-service.js';
import type {
  TemplateStore,
  TemplateRecord,
} from '../../services/template-service.js';

function makeTemplateRecord(
  overrides: Partial<TemplateRecord> = {},
): TemplateRecord {
  return {
    id: overrides.id ?? 'template-1',
    name: overrides.name ?? 'Test Template',
    description: overrides.description ?? 'A test template',
    category: overrides.category ?? 'general',
    workflowData: overrides.workflowData ?? { nodes: [], connections: {} },
    isGlobal: overrides.isGlobal ?? false,
    tenantId: overrides.tenantId ?? 'tenant-a',
    version: overrides.version ?? 1,
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? new Date('2025-01-01'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01'),
  };
}

function createMockStore(): TemplateStore & {
  create: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  listGlobal: ReturnType<typeof vi.fn>;
  listByTenant: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listGlobal: vi.fn(),
    listByTenant: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

describe('TemplateService', () => {
  let store: ReturnType<typeof createMockStore>;
  let service: TemplateService;

  beforeEach(() => {
    store = createMockStore();
    service = new TemplateService(store);
  });

  it('should create a template', async () => {
    const expected = makeTemplateRecord({ name: 'My Template' });
    store.create.mockResolvedValue(expected);

    const result = await service.create({
      name: 'My Template',
      description: 'Desc',
      category: 'marketing',
      workflowData: { nodes: [] },
      tenantId: 'tenant-a',
      tags: ['crm'],
    });

    expect(result).toEqual(expected);
    expect(store.create).toHaveBeenCalledOnce();
    const callArg = store.create.mock.calls[0]![0] as TemplateRecord;
    expect(callArg.name).toBe('My Template');
    expect(callArg.description).toBe('Desc');
    expect(callArg.category).toBe('marketing');
    expect(callArg.tenantId).toBe('tenant-a');
    expect(callArg.tags).toEqual(['crm']);
    expect(callArg.version).toBe(1);
    expect(callArg.isGlobal).toBe(false);
    expect(callArg.id).toBeDefined();
    expect(callArg.createdAt).toBeInstanceOf(Date);
    expect(callArg.updatedAt).toBeInstanceOf(Date);
  });

  it('should list global and tenant templates together', async () => {
    const globalTemplate = makeTemplateRecord({
      id: 'global-1',
      name: 'Global Template',
      isGlobal: true,
      tenantId: null,
    });
    const tenantTemplate = makeTemplateRecord({
      id: 'tenant-1',
      name: 'Tenant Template',
      tenantId: 'tenant-a',
    });

    store.listGlobal.mockResolvedValue([globalTemplate]);
    store.listByTenant.mockResolvedValue([tenantTemplate]);

    const result = await service.list('tenant-a');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(globalTemplate);
    expect(result[1]).toEqual(tenantTemplate);
    expect(store.listGlobal).toHaveBeenCalledOnce();
    expect(store.listByTenant).toHaveBeenCalledWith('tenant-a');
  });

  it('should get template by id', async () => {
    const expected = makeTemplateRecord({ id: 'template-123' });
    store.getById.mockResolvedValue(expected);

    const result = await service.get('template-123');

    expect(result).toEqual(expected);
    expect(store.getById).toHaveBeenCalledWith('template-123');
  });

  it('should update own tenant template', async () => {
    const existing = makeTemplateRecord({
      id: 'template-1',
      tenantId: 'tenant-a',
      name: 'Original',
    });
    const updated = makeTemplateRecord({
      id: 'template-1',
      tenantId: 'tenant-a',
      name: 'Updated',
    });

    store.getById.mockResolvedValue(existing);
    store.update.mockResolvedValue(updated);

    const result = await service.update('template-1', 'tenant-a', {
      name: 'Updated',
    });

    expect(result).toEqual(updated);
    expect(store.getById).toHaveBeenCalledWith('template-1');
    expect(store.update).toHaveBeenCalledOnce();
    const updateCallArg = store.update.mock.calls[0]!;
    expect(updateCallArg[0]).toBe('template-1');
    expect(updateCallArg[1]).toMatchObject({ name: 'Updated' });
    expect(updateCallArg[1].updatedAt).toBeInstanceOf(Date);
  });

  it('should not update another tenant\'s template', async () => {
    const existing = makeTemplateRecord({
      id: 'template-1',
      tenantId: 'tenant-b',
    });

    store.getById.mockResolvedValue(existing);

    const result = await service.update('template-1', 'tenant-a', {
      name: 'Hacked',
    });

    expect(result).toBeNull();
    expect(store.update).not.toHaveBeenCalled();
  });

  it('should delete own template', async () => {
    const existing = makeTemplateRecord({
      id: 'template-1',
      tenantId: 'tenant-a',
    });

    store.getById.mockResolvedValue(existing);
    store.delete.mockResolvedValue(true);

    const result = await service.delete('template-1', 'tenant-a');

    expect(result).toBe(true);
    expect(store.delete).toHaveBeenCalledWith('template-1');
  });

  it('should not delete another tenant\'s template', async () => {
    const existing = makeTemplateRecord({
      id: 'template-1',
      tenantId: 'tenant-b',
    });

    store.getById.mockResolvedValue(existing);

    const result = await service.delete('template-1', 'tenant-a');

    expect(result).toBe(false);
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('should fork template to workflow data', async () => {
    const existing = makeTemplateRecord({
      id: 'template-1',
      name: 'CRM Automation',
      workflowData: { nodes: [{ type: 'http' }], connections: {} },
    });

    store.getById.mockResolvedValue(existing);

    const result = await service.forkToWorkflow('template-1', 'tenant-a');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('CRM Automation (from template)');
    expect(result!.forkedFromTemplate).toBe('template-1');
    expect(result!.nodes).toEqual([{ type: 'http' }]);
    expect(result!.connections).toEqual({});
  });
});
