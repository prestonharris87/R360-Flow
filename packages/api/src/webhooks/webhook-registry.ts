export interface WebhookRegistration {
  tenantId: string;
  workflowId: string;
  webhookPath: string;
  method: string;
  signatureSecret?: string;
  createdAt?: Date;
}

export class WebhookRegistry {
  private registrations: Map<string, WebhookRegistration> = new Map();

  private makeKey(tenantId: string, path: string, method: string): string {
    return `${tenantId}:${method.toUpperCase()}:${path}`;
  }

  async register(registration: WebhookRegistration): Promise<void> {
    const key = this.makeKey(registration.tenantId, registration.webhookPath, registration.method);
    if (this.registrations.has(key)) {
      throw new Error(
        `Webhook path '${registration.webhookPath}' (${registration.method}) is already registered for tenant '${registration.tenantId}'`,
      );
    }
    this.registrations.set(key, { ...registration, createdAt: new Date() });
  }

  async deregister(tenantId: string, path: string, method: string): Promise<void> {
    this.registrations.delete(this.makeKey(tenantId, path, method));
  }

  async deregisterWorkflow(tenantId: string, workflowId: string): Promise<void> {
    for (const [key, reg] of this.registrations) {
      if (reg.tenantId === tenantId && reg.workflowId === workflowId) {
        this.registrations.delete(key);
      }
    }
  }

  async lookup(tenantId: string, path: string, method: string): Promise<WebhookRegistration | undefined> {
    return this.registrations.get(this.makeKey(tenantId, path, method));
  }

  async listForTenant(tenantId: string): Promise<WebhookRegistration[]> {
    const results: WebhookRegistration[] = [];
    for (const reg of this.registrations.values()) {
      if (reg.tenantId === tenantId) results.push(reg);
    }
    return results;
  }
}
