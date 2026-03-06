import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuditLogger,
  type AuditStore,
  type AuditEvent,
  type SecurityEvent,
  type AuditQuery,
} from '../../audit/audit-logger.js';

/**
 * In-memory mock implementation of AuditStore for testing.
 */
class InMemoryAuditStore implements AuditStore {
  readonly events: AuditEvent[] = [];
  readonly securityEvents: SecurityEvent[] = [];

  async saveEvent(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async saveSecurityEvent(event: SecurityEvent): Promise<void> {
    this.securityEvents.push(event);
  }

  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    let results = this.events.filter((e) => e.tenantId === query.tenantId);

    if (query.startDate) {
      results = results.filter((e) => e.timestamp >= query.startDate!);
    }
    if (query.endDate) {
      results = results.filter((e) => e.timestamp <= query.endDate!);
    }
    if (query.action) {
      results = results.filter((e) => e.action === query.action);
    }
    if (query.resourceType) {
      results = results.filter((e) => e.resourceType === query.resourceType);
    }

    const offset = query.offset ?? 0;
    const limit = query.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async querySecurityEvents(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<SecurityEvent[]> {
    let results = this.securityEvents.filter((e) => e.tenantId === tenantId);

    if (startDate) {
      results = results.filter((e) => e.timestamp >= startDate);
    }
    if (endDate) {
      results = results.filter((e) => e.timestamp <= endDate);
    }

    return results;
  }
}

describe('AuditLogger', () => {
  let store: InMemoryAuditStore;
  let logger: AuditLogger;

  beforeEach(() => {
    store = new InMemoryAuditStore();
    logger = new AuditLogger(store);
  });

  it('should record data access events via store', async () => {
    const result = await logger.log({
      tenantId: 'tenant-1',
      action: 'workflow.read',
      resourceType: 'workflow',
      resourceId: 'wf-123',
      userId: 'user-42',
      metadata: { source: 'api' },
    });

    expect(result.id).toBeDefined();
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.tenantId).toBe('tenant-1');
    expect(result.action).toBe('workflow.read');
    expect(result.resourceType).toBe('workflow');
    expect(result.resourceId).toBe('wf-123');
    expect(result.userId).toBe('user-42');
    expect(result.metadata).toEqual({ source: 'api' });
    expect(result.timestamp).toBeInstanceOf(Date);

    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toEqual(result);
  });

  it('should record cross-tenant access attempts with blocked flag', async () => {
    const result = await logger.logSecurityEvent({
      tenantId: 'tenant-1',
      eventType: 'cross_tenant_access',
      sourceIp: '192.168.1.100',
      userId: 'user-bad',
      targetTenantId: 'tenant-2',
      blocked: true,
      details: 'User attempted to access workflow belonging to another tenant',
    });

    expect(result.id).toBeDefined();
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.tenantId).toBe('tenant-1');
    expect(result.eventType).toBe('cross_tenant_access');
    expect(result.sourceIp).toBe('192.168.1.100');
    expect(result.userId).toBe('user-bad');
    expect(result.targetTenantId).toBe('tenant-2');
    expect(result.blocked).toBe(true);
    expect(result.details).toBe(
      'User attempted to access workflow belonging to another tenant',
    );
    expect(result.timestamp).toBeInstanceOf(Date);

    expect(store.securityEvents).toHaveLength(1);
    expect(store.securityEvents[0]).toEqual(result);
  });

  it('should log security events to stderr', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await logger.logSecurityEvent({
      tenantId: 'tenant-1',
      eventType: 'auth_failure',
      sourceIp: '10.0.0.5',
      blocked: true,
      details: 'Invalid JWT token presented',
    });

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      '[SECURITY] auth_failure tenant=tenant-1 blocked=true Invalid JWT token presented',
    );

    errorSpy.mockRestore();
  });

  it('should query audit logs by tenant and date range', async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    // Insert events directly into the store with controlled timestamps
    store.events.push(
      {
        id: 'evt-1',
        tenantId: 'tenant-1',
        action: 'workflow.create',
        resourceType: 'workflow',
        resourceId: 'wf-1',
        timestamp: threeHoursAgo,
      },
      {
        id: 'evt-2',
        tenantId: 'tenant-1',
        action: 'workflow.update',
        resourceType: 'workflow',
        resourceId: 'wf-1',
        timestamp: twoHoursAgo,
      },
      {
        id: 'evt-3',
        tenantId: 'tenant-1',
        action: 'workflow.execute',
        resourceType: 'workflow',
        resourceId: 'wf-1',
        timestamp: now,
      },
      {
        id: 'evt-4',
        tenantId: 'tenant-2',
        action: 'workflow.create',
        resourceType: 'workflow',
        resourceId: 'wf-99',
        timestamp: now,
      },
    );

    // Query tenant-1 events within the last 2.5 hours
    const halfHourBeforeTwoHoursAgo = new Date(
      now.getTime() - 2.5 * 60 * 60 * 1000,
    );
    const results = await logger.query({
      tenantId: 'tenant-1',
      startDate: halfHourBeforeTwoHoursAgo,
      endDate: now,
    });

    expect(results).toHaveLength(2);
    expect(results.map((e) => e.id)).toEqual(['evt-2', 'evt-3']);

    // Ensure tenant-2 events are not included
    expect(results.every((e) => e.tenantId === 'tenant-1')).toBe(true);
  });

  it('should query events by action and resource type', async () => {
    // Insert events directly into the store
    store.events.push(
      {
        id: 'evt-a',
        tenantId: 'tenant-1',
        action: 'workflow.create',
        resourceType: 'workflow',
        resourceId: 'wf-1',
        timestamp: new Date(),
      },
      {
        id: 'evt-b',
        tenantId: 'tenant-1',
        action: 'credential.create',
        resourceType: 'credential',
        resourceId: 'cred-1',
        timestamp: new Date(),
      },
      {
        id: 'evt-c',
        tenantId: 'tenant-1',
        action: 'workflow.update',
        resourceType: 'workflow',
        resourceId: 'wf-2',
        timestamp: new Date(),
      },
      {
        id: 'evt-d',
        tenantId: 'tenant-1',
        action: 'workflow.create',
        resourceType: 'workflow',
        resourceId: 'wf-3',
        timestamp: new Date(),
      },
    );

    // Filter by action only
    const createEvents = await logger.query({
      tenantId: 'tenant-1',
      action: 'workflow.create',
    });
    expect(createEvents).toHaveLength(2);
    expect(createEvents.map((e) => e.id)).toEqual(['evt-a', 'evt-d']);

    // Filter by resourceType only
    const credentialEvents = await logger.query({
      tenantId: 'tenant-1',
      resourceType: 'credential',
    });
    expect(credentialEvents).toHaveLength(1);
    expect(credentialEvents[0]!.id).toBe('evt-b');

    // Filter by both action and resourceType
    const workflowUpdates = await logger.query({
      tenantId: 'tenant-1',
      action: 'workflow.update',
      resourceType: 'workflow',
    });
    expect(workflowUpdates).toHaveLength(1);
    expect(workflowUpdates[0]!.id).toBe('evt-c');
  });
});
