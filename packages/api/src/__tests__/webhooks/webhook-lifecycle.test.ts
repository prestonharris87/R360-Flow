import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookLifecycleManager } from '../../webhooks/webhook-lifecycle';
import { WebhookRegistry } from '../../webhooks/webhook-registry';

describe('WebhookLifecycleManager', () => {
  let registry: WebhookRegistry;
  let lifecycle: WebhookLifecycleManager;

  beforeEach(() => {
    registry = new WebhookRegistry();
    lifecycle = new WebhookLifecycleManager(registry);
  });

  describe('onWorkflowActivate', () => {
    it('registers webhooks for webhook trigger nodes', async () => {
      const workflowDef = {
        nodes: [
          {
            type: 'n8n-nodes-base.webhook',
            parameters: { path: '/hooks/order-created', httpMethod: 'POST' },
          },
          {
            type: 'r360.webhookTrigger',
            parameters: { path: '/hooks/custom-event', httpMethod: 'PUT' },
          },
        ],
      };

      const registrations = await lifecycle.onWorkflowActivate('tenant-1', 'wf-1', workflowDef);

      expect(registrations).toHaveLength(2);
      expect(registrations[0]!.webhookPath).toBe('/hooks/order-created');
      expect(registrations[0]!.method).toBe('POST');
      expect(registrations[1]!.webhookPath).toBe('/hooks/custom-event');
      expect(registrations[1]!.method).toBe('PUT');

      // Verify they are actually in the registry
      const lookup1 = await registry.lookup('tenant-1', '/hooks/order-created', 'POST');
      const lookup2 = await registry.lookup('tenant-1', '/hooks/custom-event', 'PUT');
      expect(lookup1).toBeDefined();
      expect(lookup1!.workflowId).toBe('wf-1');
      expect(lookup2).toBeDefined();
      expect(lookup2!.workflowId).toBe('wf-1');
    });

    it('ignores non-webhook trigger nodes', async () => {
      const workflowDef = {
        nodes: [
          { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://example.com' } },
          { type: 'n8n-nodes-base.set', parameters: {} },
          { type: 'n8n-nodes-base.function', parameters: {} },
        ],
      };

      const registrations = await lifecycle.onWorkflowActivate('tenant-1', 'wf-2', workflowDef);

      expect(registrations).toHaveLength(0);

      const tenantHooks = await registry.listForTenant('tenant-1');
      expect(tenantHooks).toHaveLength(0);
    });

    it('uses default POST method when httpMethod is not specified', async () => {
      const workflowDef = {
        nodes: [
          { type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/default-method' } },
        ],
      };

      const registrations = await lifecycle.onWorkflowActivate('tenant-1', 'wf-3', workflowDef);

      expect(registrations).toHaveLength(1);
      expect(registrations[0]!.method).toBe('POST');
    });

    it('generates a UUID path when path parameter is not specified', async () => {
      const workflowDef = {
        nodes: [{ type: 'n8n-nodes-base.webhook', parameters: {} }],
      };

      const registrations = await lifecycle.onWorkflowActivate('tenant-1', 'wf-4', workflowDef);

      expect(registrations).toHaveLength(1);
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(registrations[0]!.webhookPath).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('handles mixed webhook and non-webhook nodes', async () => {
      const workflowDef = {
        nodes: [
          { type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/start', httpMethod: 'POST' } },
          { type: 'n8n-nodes-base.set', parameters: {} },
          { type: 'n8n-nodes-base.httpRequest', parameters: {} },
          { type: 'r360.webhookTrigger', parameters: { path: '/hooks/custom', httpMethod: 'GET' } },
        ],
      };

      const registrations = await lifecycle.onWorkflowActivate('tenant-1', 'wf-5', workflowDef);

      expect(registrations).toHaveLength(2);
      expect(registrations[0]!.webhookPath).toBe('/hooks/start');
      expect(registrations[1]!.webhookPath).toBe('/hooks/custom');
    });
  });

  describe('onWorkflowDeactivate', () => {
    it('removes all webhooks for the deactivated workflow', async () => {
      const workflowDef = {
        nodes: [
          { type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/a', httpMethod: 'POST' } },
          { type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/b', httpMethod: 'GET' } },
        ],
      };

      await lifecycle.onWorkflowActivate('tenant-1', 'wf-1', workflowDef);

      // Verify they exist
      const before = await registry.listForTenant('tenant-1');
      expect(before).toHaveLength(2);

      await lifecycle.onWorkflowDeactivate('tenant-1', 'wf-1');

      const after = await registry.listForTenant('tenant-1');
      expect(after).toHaveLength(0);
    });

    it('does not affect webhooks from other workflows', async () => {
      await lifecycle.onWorkflowActivate('tenant-1', 'wf-1', {
        nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/wf1', httpMethod: 'POST' } }],
      });
      await lifecycle.onWorkflowActivate('tenant-1', 'wf-2', {
        nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/wf2', httpMethod: 'POST' } }],
      });

      await lifecycle.onWorkflowDeactivate('tenant-1', 'wf-1');

      const remaining = await registry.listForTenant('tenant-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.workflowId).toBe('wf-2');
    });
  });

  describe('onWorkflowUpdate', () => {
    it('re-registers webhooks with updated definition', async () => {
      // Initial activation
      await lifecycle.onWorkflowActivate('tenant-1', 'wf-1', {
        nodes: [
          { type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/old-path', httpMethod: 'POST' } },
        ],
      });

      const oldLookup = await registry.lookup('tenant-1', '/hooks/old-path', 'POST');
      expect(oldLookup).toBeDefined();

      // Update with new definition
      const updated = await lifecycle.onWorkflowUpdate('tenant-1', 'wf-1', {
        nodes: [
          { type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/new-path', httpMethod: 'PUT' } },
        ],
      });

      expect(updated).toHaveLength(1);
      expect(updated[0]!.webhookPath).toBe('/hooks/new-path');
      expect(updated[0]!.method).toBe('PUT');

      // Old path should be gone
      const oldAfterUpdate = await registry.lookup('tenant-1', '/hooks/old-path', 'POST');
      expect(oldAfterUpdate).toBeUndefined();

      // New path should exist
      const newLookup = await registry.lookup('tenant-1', '/hooks/new-path', 'PUT');
      expect(newLookup).toBeDefined();
      expect(newLookup!.workflowId).toBe('wf-1');
    });

    it('handles update from webhook nodes to no webhook nodes', async () => {
      await lifecycle.onWorkflowActivate('tenant-1', 'wf-1', {
        nodes: [
          { type: 'n8n-nodes-base.webhook', parameters: { path: '/hooks/removed', httpMethod: 'POST' } },
        ],
      });

      const updated = await lifecycle.onWorkflowUpdate('tenant-1', 'wf-1', {
        nodes: [{ type: 'n8n-nodes-base.set', parameters: {} }],
      });

      expect(updated).toHaveLength(0);

      const hooks = await registry.listForTenant('tenant-1');
      expect(hooks).toHaveLength(0);
    });
  });
});
