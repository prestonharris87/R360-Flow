import crypto from 'node:crypto';
import { WebhookRegistry } from './webhook-registry';
import type { WebhookRegistration } from './webhook-registry';

export class WebhookLifecycleManager {
  private registry: WebhookRegistry;

  constructor(registry: WebhookRegistry) {
    this.registry = registry;
  }

  async onWorkflowActivate(
    tenantId: string,
    workflowId: string,
    workflowDefinition: { nodes: Array<{ type: string; parameters?: Record<string, unknown> }> },
  ): Promise<WebhookRegistration[]> {
    const registrations: WebhookRegistration[] = [];
    for (const node of workflowDefinition.nodes) {
      if (this.isWebhookTrigger(node.type)) {
        const registration: WebhookRegistration = {
          tenantId,
          workflowId,
          webhookPath: (node.parameters?.path as string) || crypto.randomUUID(),
          method: ((node.parameters?.httpMethod as string) || 'POST').toUpperCase(),
        };
        await this.registry.register(registration);
        registrations.push(registration);
      }
    }
    return registrations;
  }

  async onWorkflowDeactivate(tenantId: string, workflowId: string): Promise<void> {
    await this.registry.deregisterWorkflow(tenantId, workflowId);
  }

  async onWorkflowUpdate(
    tenantId: string,
    workflowId: string,
    workflowDefinition: { nodes: Array<{ type: string; parameters?: Record<string, unknown> }> },
  ): Promise<WebhookRegistration[]> {
    await this.onWorkflowDeactivate(tenantId, workflowId);
    return this.onWorkflowActivate(tenantId, workflowId, workflowDefinition);
  }

  private isWebhookTrigger(nodeType: string): boolean {
    return ['n8n-nodes-base.webhook', 'r360.webhookTrigger'].includes(nodeType);
  }
}
