import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookRouter } from '../../webhooks/webhook-router.js';
import type { WebhookRequest, ExecutionQueueInterface } from '../../webhooks/webhook-router.js';
import { WebhookRegistry } from '../../webhooks/webhook-registry.js';

describe('WebhookRouter', () => {
  let registry: WebhookRegistry;
  let mockQueue: ExecutionQueueInterface;
  let router: WebhookRouter;

  beforeEach(() => {
    registry = new WebhookRegistry();
    mockQueue = {
      enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    router = new WebhookRouter(registry, mockQueue);
  });

  describe('computeSignature', () => {
    it('produces a deterministic HMAC-SHA256 hex digest', () => {
      const sig1 = WebhookRouter.computeSignature('hello', 'secret');
      const sig2 = WebhookRouter.computeSignature('hello', 'secret');
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different signatures for different payloads', () => {
      const sig1 = WebhookRouter.computeSignature('hello', 'secret');
      const sig2 = WebhookRouter.computeSignature('world', 'secret');
      expect(sig1).not.toBe(sig2);
    });

    it('produces different signatures for different secrets', () => {
      const sig1 = WebhookRouter.computeSignature('hello', 'secret-a');
      const sig2 = WebhookRouter.computeSignature('hello', 'secret-b');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('handleWebhook', () => {
    it('triggers enqueue for a registered webhook', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/incoming',
        method: 'POST',
      });

      const request: WebhookRequest = {
        tenantId: 'tenant-1',
        path: '/incoming',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { data: 'test' },
      };

      const result = await router.handleWebhook(request);

      expect(result.status).toBe('accepted');
      expect(result.executionId).toBeDefined();
      expect(result.executionId).toMatch(/^exec-wh-/);
      expect(mockQueue.enqueue).toHaveBeenCalledOnce();
      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          workflowId: 'wf-1',
          triggerType: 'webhook',
          webhookData: expect.objectContaining({
            method: 'POST',
            body: { data: 'test' },
          }),
        }),
      );
    });

    it('returns not_found for an unregistered webhook', async () => {
      const request: WebhookRequest = {
        tenantId: 'tenant-1',
        path: '/nonexistent',
        method: 'POST',
        headers: {},
        body: null,
      };

      const result = await router.handleWebhook(request);

      expect(result.status).toBe('not_found');
      expect(result.message).toBe('Webhook not found');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('enforces tenant isolation -- tenant-2 cannot hit tenant-1 webhook', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/private-hook',
        method: 'POST',
      });

      const request: WebhookRequest = {
        tenantId: 'tenant-2',
        path: '/private-hook',
        method: 'POST',
        headers: {},
        body: {},
      };

      const result = await router.handleWebhook(request);

      expect(result.status).toBe('not_found');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('passes valid signature verification', async () => {
      const secret = 'my-webhook-secret';
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/signed',
        method: 'POST',
        signatureSecret: secret,
      });

      const rawBody = JSON.stringify({ event: 'test' });
      const signature = WebhookRouter.computeSignature(rawBody, secret);

      const request: WebhookRequest = {
        tenantId: 'tenant-1',
        path: '/signed',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': signature,
        },
        body: { event: 'test' },
        rawBody,
      };

      const result = await router.handleWebhook(request);

      expect(result.status).toBe('accepted');
      expect(result.executionId).toBeDefined();
      expect(mockQueue.enqueue).toHaveBeenCalledOnce();
    });

    it('rejects invalid signature', async () => {
      const secret = 'my-webhook-secret';
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/signed-reject',
        method: 'POST',
        signatureSecret: secret,
      });

      const request: WebhookRequest = {
        tenantId: 'tenant-1',
        path: '/signed-reject',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'invalid-signature-value-that-is-definitely-wrong-pad',
        },
        body: { event: 'test' },
        rawBody: JSON.stringify({ event: 'test' }),
      };

      const result = await router.handleWebhook(request);

      expect(result.status).toBe('unauthorized');
      expect(result.message).toBe('Invalid webhook signature');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('rejects when signature header is missing but secret is configured', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/signed-missing',
        method: 'POST',
        signatureSecret: 'some-secret',
      });

      const request: WebhookRequest = {
        tenantId: 'tenant-1',
        path: '/signed-missing',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { event: 'test' },
        rawBody: JSON.stringify({ event: 'test' }),
      };

      const result = await router.handleWebhook(request);

      expect(result.status).toBe('unauthorized');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('returns error status when enqueue fails', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/error-hook',
        method: 'POST',
      });

      (mockQueue.enqueue as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Queue unavailable'),
      );

      const request: WebhookRequest = {
        tenantId: 'tenant-1',
        path: '/error-hook',
        method: 'POST',
        headers: {},
        body: {},
      };

      const result = await router.handleWebhook(request);

      expect(result.status).toBe('error');
      expect(result.message).toBe('Queue unavailable');
    });
  });
});
