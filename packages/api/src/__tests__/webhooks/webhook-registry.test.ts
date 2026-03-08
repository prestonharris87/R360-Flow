import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookRegistry } from '../../webhooks/webhook-registry';
import type { WebhookRegistration } from '../../webhooks/webhook-registry';

describe('WebhookRegistry', () => {
  let registry: WebhookRegistry;

  beforeEach(() => {
    registry = new WebhookRegistry();
  });

  describe('register and lookup', () => {
    it('registers a webhook and returns it on lookup', async () => {
      const reg: WebhookRegistration = {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/hooks/incoming',
        method: 'POST',
      };

      await registry.register(reg);
      const found = await registry.lookup('tenant-1', '/hooks/incoming', 'POST');

      expect(found).toBeDefined();
      expect(found!.tenantId).toBe('tenant-1');
      expect(found!.workflowId).toBe('wf-1');
      expect(found!.webhookPath).toBe('/hooks/incoming');
      expect(found!.method).toBe('POST');
      expect(found!.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('duplicate detection', () => {
    it('throws when registering duplicate path for the same tenant', async () => {
      const reg: WebhookRegistration = {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/hooks/dup',
        method: 'POST',
      };

      await registry.register(reg);

      await expect(
        registry.register({
          tenantId: 'tenant-1',
          workflowId: 'wf-2',
          webhookPath: '/hooks/dup',
          method: 'POST',
        }),
      ).rejects.toThrow(
        "Webhook path '/hooks/dup' (POST) is already registered for tenant 'tenant-1'",
      );
    });
  });

  describe('tenant isolation', () => {
    it('allows the same path for different tenants', async () => {
      await registry.register({
        tenantId: 'tenant-a',
        workflowId: 'wf-a',
        webhookPath: '/hooks/shared',
        method: 'POST',
      });

      await registry.register({
        tenantId: 'tenant-b',
        workflowId: 'wf-b',
        webhookPath: '/hooks/shared',
        method: 'POST',
      });

      const foundA = await registry.lookup('tenant-a', '/hooks/shared', 'POST');
      const foundB = await registry.lookup('tenant-b', '/hooks/shared', 'POST');

      expect(foundA).toBeDefined();
      expect(foundA!.workflowId).toBe('wf-a');

      expect(foundB).toBeDefined();
      expect(foundB!.workflowId).toBe('wf-b');
    });
  });

  describe('deregister by path', () => {
    it('removes a webhook so lookup returns undefined', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: '/hooks/remove-me',
        method: 'GET',
      });

      await registry.deregister('tenant-1', '/hooks/remove-me', 'GET');

      const found = await registry.lookup('tenant-1', '/hooks/remove-me', 'GET');
      expect(found).toBeUndefined();
    });
  });

  describe('deregister by workflow', () => {
    it('removes all webhooks for a given workflow', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-multi',
        webhookPath: '/hooks/a',
        method: 'POST',
      });
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-multi',
        webhookPath: '/hooks/b',
        method: 'PUT',
      });
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-other',
        webhookPath: '/hooks/c',
        method: 'POST',
      });

      await registry.deregisterWorkflow('tenant-1', 'wf-multi');

      const a = await registry.lookup('tenant-1', '/hooks/a', 'POST');
      const b = await registry.lookup('tenant-1', '/hooks/b', 'PUT');
      const c = await registry.lookup('tenant-1', '/hooks/c', 'POST');

      expect(a).toBeUndefined();
      expect(b).toBeUndefined();
      expect(c).toBeDefined();
      expect(c!.workflowId).toBe('wf-other');
    });
  });

  describe('listForTenant', () => {
    it('returns only webhooks belonging to the specified tenant', async () => {
      await registry.register({
        tenantId: 'tenant-x',
        workflowId: 'wf-1',
        webhookPath: '/hooks/x1',
        method: 'POST',
      });
      await registry.register({
        tenantId: 'tenant-x',
        workflowId: 'wf-2',
        webhookPath: '/hooks/x2',
        method: 'GET',
      });
      await registry.register({
        tenantId: 'tenant-y',
        workflowId: 'wf-3',
        webhookPath: '/hooks/y1',
        method: 'POST',
      });

      const tenantXHooks = await registry.listForTenant('tenant-x');
      const tenantYHooks = await registry.listForTenant('tenant-y');

      expect(tenantXHooks).toHaveLength(2);
      expect(tenantXHooks.every((h) => h.tenantId === 'tenant-x')).toBe(true);

      expect(tenantYHooks).toHaveLength(1);
      expect(tenantYHooks[0]!.tenantId).toBe('tenant-y');
      expect(tenantYHooks[0]!.workflowId).toBe('wf-3');
    });

    it('returns empty array for a tenant with no webhooks', async () => {
      const hooks = await registry.listForTenant('tenant-nonexistent');
      expect(hooks).toEqual([]);
    });
  });
});
