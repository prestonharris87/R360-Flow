import { describe, it, expect } from 'vitest';

describe('Shared Types Package', () => {
  it('should export TenantId branded type', async () => {
    const { TenantId } = await import('../index.js');
    expect(TenantId).toBeDefined();
    expect(TenantId.__brand).toBe('TenantId');
  });

  it('should export WorkflowStatus enum', async () => {
    const { WorkflowStatus } = await import('../index.js');
    expect(WorkflowStatus.Active).toBe('active');
    expect(WorkflowStatus.Inactive).toBe('inactive');
    expect(WorkflowStatus.Draft).toBe('draft');
    expect(WorkflowStatus.Archived).toBe('archived');
  });

  it('should export ExecutionStatus enum', async () => {
    const { ExecutionStatus } = await import('../index.js');
    expect(ExecutionStatus.Pending).toBe('pending');
    expect(ExecutionStatus.Running).toBe('running');
    expect(ExecutionStatus.Success).toBe('success');
    expect(ExecutionStatus.Error).toBe('error');
    expect(ExecutionStatus.Cancelled).toBe('cancelled');
    expect(ExecutionStatus.Timeout).toBe('timeout');
  });

  it('should export UserRole enum', async () => {
    const { UserRole } = await import('../index.js');
    expect(UserRole.Owner).toBe('owner');
    expect(UserRole.Admin).toBe('admin');
    expect(UserRole.Member).toBe('member');
    expect(UserRole.Viewer).toBe('viewer');
  });

  it('should export Plan enum', async () => {
    const { Plan } = await import('../index.js');
    expect(Plan.Free).toBe('free');
    expect(Plan.Starter).toBe('starter');
    expect(Plan.Pro).toBe('pro');
    expect(Plan.Enterprise).toBe('enterprise');
  });
});
