import crypto from 'node:crypto';
import { WebhookRegistry } from './webhook-registry';

export interface WebhookRequest {
  tenantId: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body: unknown;
  rawBody?: string;
  query?: Record<string, string>;
}

export interface WebhookResponse {
  status: 'accepted' | 'not_found' | 'unauthorized' | 'error';
  executionId?: string;
  message?: string;
}

export interface ExecutionQueueInterface {
  enqueue(data: {
    tenantId: string;
    workflowId: string;
    executionId: string;
    triggerType: 'webhook';
    webhookData: {
      method: string;
      headers: Record<string, string>;
      body: unknown;
      query?: Record<string, string>;
    };
  }): Promise<{ id: string }>;
}

export class WebhookRouter {
  private registry: WebhookRegistry;
  private executionQueue: ExecutionQueueInterface;

  constructor(registry: WebhookRegistry, executionQueue: ExecutionQueueInterface) {
    this.registry = registry;
    this.executionQueue = executionQueue;
  }

  static computeSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  async handleWebhook(request: WebhookRequest): Promise<WebhookResponse> {
    const registration = await this.registry.lookup(request.tenantId, request.path, request.method);
    if (!registration) return { status: 'not_found', message: 'Webhook not found' };

    if (registration.signatureSecret) {
      const providedSig = request.headers['x-webhook-signature'];
      const rawBody = request.rawBody || JSON.stringify(request.body);
      const expectedSig = WebhookRouter.computeSignature(rawBody, registration.signatureSecret);
      const providedBuf = Buffer.from(providedSig ?? '');
      const expectedBuf = Buffer.from(expectedSig);
      if (!providedSig || providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
        return { status: 'unauthorized', message: 'Invalid webhook signature' };
      }
    }

    const executionId = `exec-wh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    try {
      await this.executionQueue.enqueue({
        tenantId: request.tenantId,
        workflowId: registration.workflowId,
        executionId,
        triggerType: 'webhook',
        webhookData: {
          method: request.method,
          headers: request.headers,
          body: request.body,
          query: request.query,
        },
      });
      return { status: 'accepted', executionId };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Failed to enqueue' };
    }
  }
}
