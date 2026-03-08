import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExecutionMonitor,
  type ExecutionEvent,
  type ExecutionEventType,
} from '../../realtime/execution-monitor';

function makeEvent(
  overrides: Partial<ExecutionEvent> = {},
): ExecutionEvent {
  return {
    executionId: 'exec-1',
    tenantId: 'tenant-1',
    type: 'workflow_started',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ExecutionMonitor', () => {
  let monitor: ExecutionMonitor;

  beforeEach(() => {
    monitor = new ExecutionMonitor();
  });

  // ── subscribe / unsubscribe ──────────────────────────────────────

  it('subscribe returns an unsubscribe function', () => {
    const unsubscribe = monitor.subscribe('tenant-1', 'exec-1', () => {});
    expect(typeof unsubscribe).toBe('function');
  });

  it('delivers events to subscribed listeners', () => {
    const received: ExecutionEvent[] = [];
    monitor.subscribe('tenant-1', 'exec-1', (e) => received.push(e));

    const event = makeEvent();
    monitor.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('does NOT deliver events after unsubscribe', () => {
    const received: ExecutionEvent[] = [];
    const unsub = monitor.subscribe('tenant-1', 'exec-1', (e) =>
      received.push(e),
    );

    monitor.emit(makeEvent());
    expect(received).toHaveLength(1);

    unsub();

    monitor.emit(makeEvent());
    expect(received).toHaveLength(1); // still 1 — no new delivery
  });

  // ── tenant isolation ─────────────────────────────────────────────

  it('events do NOT cross tenants', () => {
    const tenant1Events: ExecutionEvent[] = [];
    const tenant2Events: ExecutionEvent[] = [];

    monitor.subscribe('tenant-1', 'exec-1', (e) => tenant1Events.push(e));
    monitor.subscribe('tenant-2', 'exec-1', (e) => tenant2Events.push(e));

    monitor.emit(makeEvent({ tenantId: 'tenant-1', executionId: 'exec-1' }));

    expect(tenant1Events).toHaveLength(1);
    expect(tenant2Events).toHaveLength(0);
  });

  // ── execution isolation ──────────────────────────────────────────

  it('events for exec-1 do NOT reach exec-2 subscriber', () => {
    const exec1Events: ExecutionEvent[] = [];
    const exec2Events: ExecutionEvent[] = [];

    monitor.subscribe('tenant-1', 'exec-1', (e) => exec1Events.push(e));
    monitor.subscribe('tenant-1', 'exec-2', (e) => exec2Events.push(e));

    monitor.emit(makeEvent({ executionId: 'exec-1' }));

    expect(exec1Events).toHaveLength(1);
    expect(exec2Events).toHaveLength(0);
  });

  // ── subscribeTenant ──────────────────────────────────────────────

  it('subscribeTenant receives events for all executions in that tenant', () => {
    const allTenantEvents: ExecutionEvent[] = [];
    monitor.subscribeTenant('tenant-1', (e) => allTenantEvents.push(e));

    monitor.emit(makeEvent({ executionId: 'exec-a' }));
    monitor.emit(makeEvent({ executionId: 'exec-b' }));
    monitor.emit(makeEvent({ executionId: 'exec-c' }));

    expect(allTenantEvents).toHaveLength(3);
    expect(allTenantEvents.map((e) => e.executionId)).toEqual([
      'exec-a',
      'exec-b',
      'exec-c',
    ]);
  });

  it('subscribeTenant does NOT receive events from other tenants', () => {
    const tenantEvents: ExecutionEvent[] = [];
    monitor.subscribeTenant('tenant-1', (e) => tenantEvents.push(e));

    monitor.emit(makeEvent({ tenantId: 'tenant-2', executionId: 'exec-x' }));

    expect(tenantEvents).toHaveLength(0);
  });

  it('subscribeTenant unsubscribe stops delivery', () => {
    const received: ExecutionEvent[] = [];
    const unsub = monitor.subscribeTenant('tenant-1', (e) =>
      received.push(e),
    );

    monitor.emit(makeEvent());
    expect(received).toHaveLength(1);

    unsub();

    monitor.emit(makeEvent());
    expect(received).toHaveLength(1);
  });

  // ── all event types handled ──────────────────────────────────────

  it('handles all event types', () => {
    const eventTypes: ExecutionEventType[] = [
      'workflow_started',
      'node_started',
      'node_completed',
      'workflow_completed',
      'workflow_error',
    ];

    const received: ExecutionEvent[] = [];
    monitor.subscribe('tenant-1', 'exec-1', (e) => received.push(e));

    for (const type of eventTypes) {
      monitor.emit(
        makeEvent({
          type,
          nodeId: type.startsWith('node') ? 'node-1' : undefined,
          nodeName: type.startsWith('node') ? 'HTTP Request' : undefined,
          outputData: type === 'node_completed' ? { items: [] } : undefined,
          durationMs: type === 'workflow_completed' ? 1234 : undefined,
          error: type === 'workflow_error' ? 'Something went wrong' : undefined,
          status:
            type === 'workflow_completed'
              ? 'success'
              : type === 'workflow_error'
                ? 'error'
                : undefined,
        }),
      );
    }

    expect(received).toHaveLength(eventTypes.length);
    expect(received.map((e) => e.type)).toEqual(eventTypes);

    // Spot-check specific event payloads
    const nodeStarted = received.find((e) => e.type === 'node_started');
    expect(nodeStarted?.nodeId).toBe('node-1');
    expect(nodeStarted?.nodeName).toBe('HTTP Request');

    const nodeCompleted = received.find((e) => e.type === 'node_completed');
    expect(nodeCompleted?.outputData).toEqual({ items: [] });

    const workflowCompleted = received.find(
      (e) => e.type === 'workflow_completed',
    );
    expect(workflowCompleted?.durationMs).toBe(1234);
    expect(workflowCompleted?.status).toBe('success');

    const workflowError = received.find((e) => e.type === 'workflow_error');
    expect(workflowError?.error).toBe('Something went wrong');
    expect(workflowError?.status).toBe('error');
  });

  // ── getSubscriberCount ───────────────────────────────────────────

  it('getSubscriberCount tracks active subscriptions', () => {
    expect(monitor.getSubscriberCount()).toBe(0);

    const unsub1 = monitor.subscribe('tenant-1', 'exec-1', () => {});
    expect(monitor.getSubscriberCount()).toBe(1);

    const unsub2 = monitor.subscribe('tenant-1', 'exec-2', () => {});
    expect(monitor.getSubscriberCount()).toBe(2);

    const unsub3 = monitor.subscribeTenant('tenant-1', () => {});
    expect(monitor.getSubscriberCount()).toBe(3);

    unsub1();
    expect(monitor.getSubscriberCount()).toBe(2);

    unsub2();
    expect(monitor.getSubscriberCount()).toBe(1);

    unsub3();
    expect(monitor.getSubscriberCount()).toBe(0);
  });

  // ── multiple listeners ───────────────────────────────────────────

  it('supports multiple listeners on the same execution', () => {
    const received1: ExecutionEvent[] = [];
    const received2: ExecutionEvent[] = [];

    monitor.subscribe('tenant-1', 'exec-1', (e) => received1.push(e));
    monitor.subscribe('tenant-1', 'exec-1', (e) => received2.push(e));

    monitor.emit(makeEvent());

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it('both execution and tenant subscribers receive the same event', () => {
    const execEvents: ExecutionEvent[] = [];
    const tenantEvents: ExecutionEvent[] = [];

    monitor.subscribe('tenant-1', 'exec-1', (e) => execEvents.push(e));
    monitor.subscribeTenant('tenant-1', (e) => tenantEvents.push(e));

    const event = makeEvent();
    monitor.emit(event);

    expect(execEvents).toHaveLength(1);
    expect(tenantEvents).toHaveLength(1);
    expect(execEvents[0]).toBe(event);
    expect(tenantEvents[0]).toBe(event);
  });
});
