import { randomUUID } from 'node:crypto';

export interface TenantRecord {
  id: string;
  name: string;
  plan: string;
  stripeCustomerId?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantDb {
  create(
    tenant: Omit<TenantRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<TenantRecord>;
  getById(id: string): Promise<TenantRecord | null>;
  getByStripeCustomerId(customerId: string): Promise<TenantRecord | null>;
  update(
    id: string,
    data: Partial<
      Pick<TenantRecord, 'name' | 'plan' | 'stripeCustomerId' | 'active'>
    >,
  ): Promise<TenantRecord | null>;
}

export class TenantService {
  constructor(private db: TenantDb) {}

  async createTenant(params: {
    name: string;
    plan?: string;
  }): Promise<TenantRecord> {
    const id = randomUUID();
    return this.db.create({
      id,
      name: params.name,
      plan: params.plan ?? 'free',
      active: true,
    });
  }

  async getTenant(id: string): Promise<TenantRecord | null> {
    return this.db.getById(id);
  }

  async updatePlan(
    id: string,
    plan: string,
  ): Promise<TenantRecord | null> {
    return this.db.update(id, { plan });
  }

  async deactivate(id: string): Promise<TenantRecord | null> {
    return this.db.update(id, { active: false });
  }

  async setStripeCustomerId(
    id: string,
    customerId: string,
  ): Promise<TenantRecord | null> {
    return this.db.update(id, { stripeCustomerId: customerId });
  }

  async getByStripeCustomerId(
    customerId: string,
  ): Promise<TenantRecord | null> {
    return this.db.getByStripeCustomerId(customerId);
  }
}
