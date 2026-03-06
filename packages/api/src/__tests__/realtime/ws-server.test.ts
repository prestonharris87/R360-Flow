import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import http from 'node:http';
import { createExecutionWSServer } from '../../realtime/ws-server.js';
import { ExecutionMonitor } from '../../realtime/execution-monitor.js';
import type { WSAuthenticator } from '../../realtime/ws-server.js';
import type { ExecutionEvent } from '../../realtime/execution-monitor.js';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Wait for the next message on a WebSocket client, parsed as JSON. */
function waitForMessage<T = unknown>(ws: WebSocket, timeoutMs = 3000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`waitForMessage timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as T);
    });
  });
}

/** Wait for a WebSocket to reach OPEN readyState. */
function waitForOpen(ws: WebSocket, timeoutMs = 3000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error('waitForOpen timed out'));
    }, timeoutMs);

    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });

    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Wait for a WebSocket close event and return { code, reason }. */
function waitForClose(ws: WebSocket, timeoutMs = 3000): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('waitForClose timed out'));
    }, timeoutMs);

    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

/** Create a connected WS client against the test server. */
function createClient(port: number, queryParams = ''): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}${queryParams ? `?${queryParams}` : ''}`);
}

function makeEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    executionId: 'exec-1',
    tenantId: 'tenant-1',
    type: 'workflow_started',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── Mock authenticator ──────────────────────────────────────────────────

function createMockAuth(): WSAuthenticator {
  return {
    async authenticateToken(token: string) {
      if (token === 'valid-token-tenant-1') {
        return { tenantId: 'tenant-1', userId: 'user-1' };
      }
      if (token === 'valid-token-tenant-2') {
        return { tenantId: 'tenant-2', userId: 'user-2' };
      }
      return null;
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('WebSocket Server', () => {
  let httpServer: http.Server;
  let wss: ReturnType<typeof createExecutionWSServer>;
  let monitor: ExecutionMonitor;
  let port: number;
  const openClients: WebSocket[] = [];

  /** Track clients so we can close them in afterEach. */
  function trackClient(ws: WebSocket): WebSocket {
    openClients.push(ws);
    return ws;
  }

  beforeEach(async () => {
    monitor = new ExecutionMonitor();
    httpServer = http.createServer();
    wss = createExecutionWSServer(httpServer, monitor, createMockAuth());

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = httpServer.address();
    if (typeof addr === 'string' || !addr) {
      throw new Error('Expected address object');
    }
    port = addr.port;
  });

  afterEach(async () => {
    // Close all tracked clients
    for (const client of openClients) {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.close();
      }
    }
    openClients.length = 0;

    // Close WSS then HTTP server
    await new Promise<void>((resolve, reject) => {
      wss.close((err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── Authentication ───────────────────────────────────────────────────

  it('accepts authenticated connection and sends welcome message', async () => {
    const ws = trackClient(createClient(port, 'token=valid-token-tenant-1'));
    await waitForOpen(ws);

    const welcome = await waitForMessage<{ type: string; tenantId: string }>(ws);
    expect(welcome.type).toBe('connected');
    expect(welcome.tenantId).toBe('tenant-1');
  });

  it('rejects connection with no token (close code 4001)', async () => {
    const ws = trackClient(createClient(port));
    const { code, reason } = await waitForClose(ws);
    expect(code).toBe(4001);
    expect(reason).toBe('Missing authentication token');
  });

  it('rejects connection with invalid token (close code 4003)', async () => {
    const ws = trackClient(createClient(port, 'token=bad-token'));
    const { code, reason } = await waitForClose(ws);
    expect(code).toBe(4003);
    expect(reason).toBe('Invalid authentication token');
  });

  // ── Subscription ─────────────────────────────────────────────────────

  it('client subscribes to execution updates and receives events', async () => {
    const ws = trackClient(createClient(port, 'token=valid-token-tenant-1'));
    await waitForOpen(ws);

    // Consume welcome
    await waitForMessage(ws);

    // Subscribe to an execution
    ws.send(JSON.stringify({ action: 'subscribe_execution', executionId: 'exec-1' }));
    const subAck = await waitForMessage<{ type: string; executionId: string }>(ws);
    expect(subAck.type).toBe('subscribed');
    expect(subAck.executionId).toBe('exec-1');

    // Emit an event through the monitor
    const event = makeEvent({ type: 'node_started', nodeId: 'node-1', nodeName: 'HTTP Request' });
    monitor.emit(event);

    const received = await waitForMessage<{ type: string; executionId: string; nodeId: string }>(ws);
    expect(received.type).toBe('execution_event');
    expect(received.executionId).toBe('exec-1');
    expect(received.nodeId).toBe('node-1');
  });

  it('client subscribes to tenant-wide updates and receives events', async () => {
    const ws = trackClient(createClient(port, 'token=valid-token-tenant-1'));
    await waitForOpen(ws);
    await waitForMessage(ws); // welcome

    ws.send(JSON.stringify({ action: 'subscribe_tenant' }));
    const subAck = await waitForMessage<{ type: string; tenantId: string }>(ws);
    expect(subAck.type).toBe('subscribed_tenant');
    expect(subAck.tenantId).toBe('tenant-1');

    // Emit events for different executions in the same tenant
    monitor.emit(makeEvent({ executionId: 'exec-a' }));
    monitor.emit(makeEvent({ executionId: 'exec-b' }));

    const msg1 = await waitForMessage<{ type: string; executionId: string }>(ws);
    const msg2 = await waitForMessage<{ type: string; executionId: string }>(ws);
    expect(msg1.executionId).toBe('exec-a');
    expect(msg2.executionId).toBe('exec-b');
  });

  // ── Tenant isolation ─────────────────────────────────────────────────

  it('tenant isolation - client only receives events for their tenant', async () => {
    // Connect tenant-1 client
    const ws1 = trackClient(createClient(port, 'token=valid-token-tenant-1'));
    await waitForOpen(ws1);
    await waitForMessage(ws1); // welcome

    // Connect tenant-2 client
    const ws2 = trackClient(createClient(port, 'token=valid-token-tenant-2'));
    await waitForOpen(ws2);
    await waitForMessage(ws2); // welcome

    // Both subscribe to tenant-wide events
    ws1.send(JSON.stringify({ action: 'subscribe_tenant' }));
    await waitForMessage(ws1); // subscribed_tenant ack

    ws2.send(JSON.stringify({ action: 'subscribe_tenant' }));
    await waitForMessage(ws2); // subscribed_tenant ack

    // Emit event for tenant-1 only
    monitor.emit(makeEvent({ tenantId: 'tenant-1', executionId: 'exec-t1' }));

    // tenant-1 client should receive it
    const msg1 = await waitForMessage<{ type: string; executionId: string }>(ws1);
    expect(msg1.type).toBe('execution_event');
    expect(msg1.executionId).toBe('exec-t1');

    // tenant-2 client should NOT receive it (we verify by sending a tenant-2 event
    // and ensuring that's the first message tenant-2 gets)
    monitor.emit(makeEvent({ tenantId: 'tenant-2', executionId: 'exec-t2' }));

    const msg2 = await waitForMessage<{ type: string; executionId: string }>(ws2);
    expect(msg2.type).toBe('execution_event');
    expect(msg2.executionId).toBe('exec-t2');
    // If tenant-2 had received the tenant-1 event, this would be 'exec-t1' instead
  });

  // ── Error handling ───────────────────────────────────────────────────

  it('sends error on unknown action', async () => {
    const ws = trackClient(createClient(port, 'token=valid-token-tenant-1'));
    await waitForOpen(ws);
    await waitForMessage(ws); // welcome

    ws.send(JSON.stringify({ action: 'unknown_action' }));
    const errorMsg = await waitForMessage<{ type: string; message: string }>(ws);
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.message).toContain('Unknown action');
  });

  it('sends error on invalid JSON message', async () => {
    const ws = trackClient(createClient(port, 'token=valid-token-tenant-1'));
    await waitForOpen(ws);
    await waitForMessage(ws); // welcome

    ws.send('this is not json');
    const errorMsg = await waitForMessage<{ type: string; message: string }>(ws);
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.message).toBe('Invalid message format');
  });

  it('sends error when subscribe_execution is missing executionId', async () => {
    const ws = trackClient(createClient(port, 'token=valid-token-tenant-1'));
    await waitForOpen(ws);
    await waitForMessage(ws); // welcome

    ws.send(JSON.stringify({ action: 'subscribe_execution' }));
    const errorMsg = await waitForMessage<{ type: string; message: string }>(ws);
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.message).toBe('Missing executionId');
  });

  // ── Cleanup ──────────────────────────────────────────────────────────

  it('cleans up subscriptions when client disconnects', async () => {
    const ws = trackClient(createClient(port, 'token=valid-token-tenant-1'));
    await waitForOpen(ws);
    await waitForMessage(ws); // welcome

    ws.send(JSON.stringify({ action: 'subscribe_execution', executionId: 'exec-1' }));
    await waitForMessage(ws); // subscribed ack

    ws.send(JSON.stringify({ action: 'subscribe_tenant' }));
    await waitForMessage(ws); // subscribed_tenant ack

    expect(monitor.getSubscriberCount()).toBe(2);

    // Close the client
    ws.close();
    await waitForClose(ws);

    // Give a tick for the server-side 'close' handler to fire
    await new Promise((r) => setTimeout(r, 50));

    expect(monitor.getSubscriberCount()).toBe(0);
  });
});
