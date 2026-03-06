import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { ExecutionMonitor, ExecutionEvent } from './execution-monitor.js';

export interface WSAuthenticator {
  authenticateToken(token: string): Promise<{ tenantId: string; userId: string } | null>;
}

interface AuthenticatedClient {
  ws: WebSocket;
  tenantId: string;
  userId: string;
  subscriptions: Array<() => void>;
}

export function createExecutionWSServer(
  server: HttpServer,
  monitor: ExecutionMonitor,
  auth: WSAuthenticator,
): WebSocketServer {
  const wss = new WebSocketServer({ server });
  const clients: Map<WebSocket, AuthenticatedClient> = new Map();

  wss.on('connection', async (ws, req) => {
    // Extract token from query string
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    const authResult = await auth.authenticateToken(token);
    if (!authResult) {
      ws.close(4003, 'Invalid authentication token');
      return;
    }

    const client: AuthenticatedClient = {
      ws,
      tenantId: authResult.tenantId,
      userId: authResult.userId,
      subscriptions: [],
    };
    clients.set(ws, client);

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', tenantId: authResult.tenantId }));

    // Handle incoming messages (subscription requests)
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        handleClientMessage(client, monitor, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      // Clean up subscriptions
      for (const unsub of client.subscriptions) unsub();
      clients.delete(ws);
    });

    ws.on('error', () => {
      for (const unsub of client.subscriptions) unsub();
      clients.delete(ws);
    });
  });

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, 30_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}

function handleClientMessage(
  client: AuthenticatedClient,
  monitor: ExecutionMonitor,
  msg: Record<string, unknown>,
): void {
  const sendEvent = (event: ExecutionEvent) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: 'execution_event', ...event }));
    }
  };

  switch (msg.action) {
    case 'subscribe_execution': {
      const executionId = msg.executionId as string;
      if (!executionId) {
        client.ws.send(JSON.stringify({ type: 'error', message: 'Missing executionId' }));
        return;
      }
      const unsub = monitor.subscribe(client.tenantId, executionId, sendEvent);
      client.subscriptions.push(unsub);
      client.ws.send(JSON.stringify({ type: 'subscribed', executionId }));
      break;
    }
    case 'subscribe_tenant': {
      const unsub = monitor.subscribeTenant(client.tenantId, sendEvent);
      client.subscriptions.push(unsub);
      client.ws.send(JSON.stringify({ type: 'subscribed_tenant', tenantId: client.tenantId }));
      break;
    }
    default:
      client.ws.send(JSON.stringify({ type: 'error', message: `Unknown action: ${msg.action}` }));
  }
}
