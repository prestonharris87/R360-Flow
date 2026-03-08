import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import http from 'node:http';
import { createExecutionWSServer } from '../../realtime/ws-server';
import { ExecutionMonitor } from '../../realtime/execution-monitor';
import type { WSAuthenticator } from '../../realtime/ws-server';
import type { ExecutionEvent } from '../../realtime/execution-monitor';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Wraps a WebSocket client with a message queue so that messages arriving
 * before a consumer awaits them are buffered rather than lost.
 */
interface QueuedClient {
  ws: WebSocket;
  /** Returns the next message (buffered or future), parsed as JSON. */
  nextMessage: <T = unknown>(timeoutMs?: number) => Promise<T>;
  /** Wait for the WebSocket close event. */
  waitClose: (timeoutMs?: number) => Promise<{ code: number; reason: string }>;
}

function createQueuedClient(port: number, queryParams = ''): QueuedClient {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}${queryParams ? `?${queryParams}` : ''}`,
  );

  // Buffer incoming messages immediately so none are missed
  const messageQueue: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];

  ws.on('message', (data) => {
    const parsed: unknown = JSON.parse(data.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      messageQueue.push(parsed);
    }
  });

  function nextMessage<T = unknown>(timeoutMs = 3000): Promise<T> {
    // If there's already a buffered message, return it immediately
    const buffered = messageQueue.shift();
    if (buffered !== undefined) {
      return Promise.resolve(buffered as T);
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this waiter from the queue
        const idx = waiters.indexOf(resolve as (value: unknown) => void);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`nextMessage timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const wrappedResolve = (value: unknown) => {
        clearTimeout(timer);
        resolve(value as T);
      };
      waiters.push(wrappedResolve);
    });
  }

  function waitClose(timeoutMs = 3000): Promise<{ code: number; reason: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('waitClose timed out'));
      }, timeoutMs);

      ws.once('close', (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
    });
  }

  return { ws, nextMessage, waitClose };
}

/** Wait for a raw WebSocket close event (for unauthenticated clients). */
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
    const client = createQueuedClient(port, 'token=valid-token-tenant-1');
    trackClient(client.ws);

    const welcome = await client.nextMessage<{ type: string; tenantId: string }>();
    expect(welcome.type).toBe('connected');
    expect(welcome.tenantId).toBe('tenant-1');
  });

  it('rejects connection with no token (close code 4001)', async () => {
    const ws = trackClient(new WebSocket(`ws://127.0.0.1:${port}`));
    const { code, reason } = await waitForClose(ws);
    expect(code).toBe(4001);
    expect(reason).toBe('Missing authentication token');
  });

  it('rejects connection with invalid token (close code 4003)', async () => {
    const ws = trackClient(new WebSocket(`ws://127.0.0.1:${port}?token=bad-token`));
    const { code, reason } = await waitForClose(ws);
    expect(code).toBe(4003);
    expect(reason).toBe('Invalid authentication token');
  });

  // ── Subscription ─────────────────────────────────────────────────────

  it('client subscribes to execution updates and receives events', async () => {
    const client = createQueuedClient(port, 'token=valid-token-tenant-1');
    trackClient(client.ws);

    // Consume welcome
    await client.nextMessage();

    // Subscribe to an execution
    client.ws.send(JSON.stringify({ action: 'subscribe_execution', executionId: 'exec-1' }));
    const subAck = await client.nextMessage<{ type: string; executionId: string }>();
    expect(subAck.type).toBe('subscribed');
    expect(subAck.executionId).toBe('exec-1');

    // Emit an event through the monitor
    const event = makeEvent({ type: 'node_started', nodeId: 'node-1', nodeName: 'HTTP Request' });
    monitor.emit(event);

    const received = await client.nextMessage<{ type: string; event: ExecutionEvent }>();
    expect(received.type).toBe('execution_event');
    expect(received.event.executionId).toBe('exec-1');
    expect(received.event.nodeId).toBe('node-1');
  });

  it('client subscribes to tenant-wide updates and receives events', async () => {
    const client = createQueuedClient(port, 'token=valid-token-tenant-1');
    trackClient(client.ws);
    await client.nextMessage(); // welcome

    client.ws.send(JSON.stringify({ action: 'subscribe_tenant' }));
    const subAck = await client.nextMessage<{ type: string; tenantId: string }>();
    expect(subAck.type).toBe('subscribed_tenant');
    expect(subAck.tenantId).toBe('tenant-1');

    // Emit events for different executions in the same tenant
    monitor.emit(makeEvent({ executionId: 'exec-a' }));
    monitor.emit(makeEvent({ executionId: 'exec-b' }));

    const msg1 = await client.nextMessage<{ type: string; event: ExecutionEvent }>();
    const msg2 = await client.nextMessage<{ type: string; event: ExecutionEvent }>();
    expect(msg1.event.executionId).toBe('exec-a');
    expect(msg2.event.executionId).toBe('exec-b');
  });

  // ── Tenant isolation ─────────────────────────────────────────────────

  it('tenant isolation - client only receives events for their tenant', async () => {
    // Connect tenant-1 client
    const client1 = createQueuedClient(port, 'token=valid-token-tenant-1');
    trackClient(client1.ws);
    await client1.nextMessage(); // welcome

    // Connect tenant-2 client
    const client2 = createQueuedClient(port, 'token=valid-token-tenant-2');
    trackClient(client2.ws);
    await client2.nextMessage(); // welcome

    // Both subscribe to tenant-wide events
    client1.ws.send(JSON.stringify({ action: 'subscribe_tenant' }));
    await client1.nextMessage(); // subscribed_tenant ack

    client2.ws.send(JSON.stringify({ action: 'subscribe_tenant' }));
    await client2.nextMessage(); // subscribed_tenant ack

    // Emit event for tenant-1 only
    monitor.emit(makeEvent({ tenantId: 'tenant-1', executionId: 'exec-t1' }));

    // tenant-1 client should receive it
    const msg1 = await client1.nextMessage<{ type: string; event: ExecutionEvent }>();
    expect(msg1.type).toBe('execution_event');
    expect(msg1.event.executionId).toBe('exec-t1');

    // tenant-2 client should NOT receive it (we verify by sending a tenant-2 event
    // and ensuring that's the first message tenant-2 gets)
    monitor.emit(makeEvent({ tenantId: 'tenant-2', executionId: 'exec-t2' }));

    const msg2 = await client2.nextMessage<{ type: string; event: ExecutionEvent }>();
    expect(msg2.type).toBe('execution_event');
    expect(msg2.event.executionId).toBe('exec-t2');
    // If tenant-2 had received the tenant-1 event, this would be 'exec-t1' instead
  });

  // ── Error handling ───────────────────────────────────────────────────

  it('sends error on unknown action', async () => {
    const client = createQueuedClient(port, 'token=valid-token-tenant-1');
    trackClient(client.ws);
    await client.nextMessage(); // welcome

    client.ws.send(JSON.stringify({ action: 'unknown_action' }));
    const errorMsg = await client.nextMessage<{ type: string; message: string }>();
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.message).toContain('Unknown action');
  });

  it('sends error on invalid JSON message', async () => {
    const client = createQueuedClient(port, 'token=valid-token-tenant-1');
    trackClient(client.ws);
    await client.nextMessage(); // welcome

    client.ws.send('this is not json');
    const errorMsg = await client.nextMessage<{ type: string; message: string }>();
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.message).toBe('Invalid message format');
  });

  it('sends error when subscribe_execution is missing executionId', async () => {
    const client = createQueuedClient(port, 'token=valid-token-tenant-1');
    trackClient(client.ws);
    await client.nextMessage(); // welcome

    client.ws.send(JSON.stringify({ action: 'subscribe_execution' }));
    const errorMsg = await client.nextMessage<{ type: string; message: string }>();
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.message).toBe('Missing executionId');
  });

  // ── Cleanup ──────────────────────────────────────────────────────────

  it('cleans up subscriptions when client disconnects', async () => {
    const client = createQueuedClient(port, 'token=valid-token-tenant-1');
    trackClient(client.ws);
    await client.nextMessage(); // welcome

    client.ws.send(JSON.stringify({ action: 'subscribe_execution', executionId: 'exec-1' }));
    await client.nextMessage(); // subscribed ack

    client.ws.send(JSON.stringify({ action: 'subscribe_tenant' }));
    await client.nextMessage(); // subscribed_tenant ack

    expect(monitor.getSubscriberCount()).toBe(2);

    // Close the client
    client.ws.close();
    await client.waitClose();

    // Give a tick for the server-side 'close' handler to fire
    await new Promise((r) => setTimeout(r, 50));

    expect(monitor.getSubscriberCount()).toBe(0);
  });
});
