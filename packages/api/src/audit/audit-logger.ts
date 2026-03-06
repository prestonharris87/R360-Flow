import crypto from 'node:crypto';

export interface AuditEvent {
  id: string;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface SecurityEvent {
  id: string;
  tenantId: string;
  eventType: 'cross_tenant_access' | 'auth_failure' | 'rate_limit' | 'suspicious_input';
  sourceIp?: string;
  userId?: string;
  targetTenantId?: string;
  blocked: boolean;
  details: string;
  timestamp: Date;
}

export interface AuditQuery {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  action?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStore {
  saveEvent(event: AuditEvent): Promise<void>;
  saveSecurityEvent(event: SecurityEvent): Promise<void>;
  queryEvents(query: AuditQuery): Promise<AuditEvent[]>;
  querySecurityEvents(tenantId: string, startDate?: Date, endDate?: Date): Promise<SecurityEvent[]>;
}

export class AuditLogger {
  constructor(private store: AuditStore) {}

  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
    const fullEvent: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    await this.store.saveEvent(fullEvent);
    return fullEvent;
  }

  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<SecurityEvent> {
    const fullEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    // Security events logged to stderr for alerting
    console.error(`[SECURITY] ${event.eventType} tenant=${event.tenantId} blocked=${event.blocked} ${event.details}`);
    await this.store.saveSecurityEvent(fullEvent);
    return fullEvent;
  }

  async query(query: AuditQuery): Promise<AuditEvent[]> {
    return this.store.queryEvents(query);
  }

  async querySecurityEvents(tenantId: string, startDate?: Date, endDate?: Date): Promise<SecurityEvent[]> {
    return this.store.querySecurityEvents(tenantId, startDate, endDate);
  }
}
