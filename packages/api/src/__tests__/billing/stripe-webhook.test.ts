import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StripeWebhookHandler,
  type TenantServiceInterface,
  type UsageTrackerInterface,
} from '../../billing/stripe-webhook-handler.js';
import type Stripe from 'stripe';

function createMockTenantService(): TenantServiceInterface & {
  setStripeCustomerId: ReturnType<typeof vi.fn>;
  updatePlan: ReturnType<typeof vi.fn>;
  getByStripeCustomerId: ReturnType<typeof vi.fn>;
} {
  return {
    setStripeCustomerId: vi.fn().mockResolvedValue(undefined),
    updatePlan: vi.fn().mockResolvedValue(undefined),
    getByStripeCustomerId: vi.fn().mockResolvedValue(null),
  };
}

function createMockUsageTracker(): UsageTrackerInterface & {
  getCurrentUsage: ReturnType<typeof vi.fn>;
} {
  return {
    getCurrentUsage: vi.fn().mockResolvedValue({ executionCount: 0 }),
  };
}

function makeStripeEvent(
  type: string,
  object: Record<string, unknown>,
): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2024-12-18.acacia',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

describe('StripeWebhookHandler', () => {
  let tenantService: ReturnType<typeof createMockTenantService>;
  let usageTracker: ReturnType<typeof createMockUsageTracker>;
  let handler: StripeWebhookHandler;

  beforeEach(() => {
    tenantService = createMockTenantService();
    usageTracker = createMockUsageTracker();
    handler = new StripeWebhookHandler(tenantService, usageTracker);
  });

  it('should link Stripe customer on checkout.session.completed', async () => {
    const event = makeStripeEvent('checkout.session.completed', {
      id: 'cs_test_123',
      client_reference_id: 'tenant-abc',
      customer: 'cus_stripe_123',
      payment_status: 'paid',
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('stripe_customer_linked');
    expect(tenantService.setStripeCustomerId).toHaveBeenCalledOnce();
    expect(tenantService.setStripeCustomerId).toHaveBeenCalledWith(
      'tenant-abc',
      'cus_stripe_123',
    );
  });

  it('should return handled:false when checkout.session.completed has no tenant id', async () => {
    const event = makeStripeEvent('checkout.session.completed', {
      id: 'cs_test_123',
      client_reference_id: null,
      customer: 'cus_stripe_123',
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(false);
    expect(tenantService.setStripeCustomerId).not.toHaveBeenCalled();
  });

  it('should update plan on customer.subscription.updated', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue({
      id: 'tenant-abc',
      plan: 'free',
    });

    const event = makeStripeEvent('customer.subscription.updated', {
      id: 'sub_test_123',
      customer: 'cus_stripe_123',
      status: 'active',
      items: {
        data: [
          {
            price: { id: 'price_pro_monthly' },
          },
        ],
      },
      metadata: {},
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('plan_updated_to_pro');
    expect(tenantService.updatePlan).toHaveBeenCalledOnce();
    expect(tenantService.updatePlan).toHaveBeenCalledWith('tenant-abc', 'pro');
  });

  it('should map enterprise price id correctly', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue({
      id: 'tenant-xyz',
      plan: 'pro',
    });

    const event = makeStripeEvent('customer.subscription.updated', {
      id: 'sub_test_456',
      customer: 'cus_stripe_456',
      status: 'active',
      items: {
        data: [
          {
            price: { id: 'price_enterprise_annual' },
          },
        ],
      },
      metadata: {},
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('plan_updated_to_enterprise');
    expect(tenantService.updatePlan).toHaveBeenCalledWith('tenant-xyz', 'enterprise');
  });

  it('should map plan from metadata when price id is generic', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue({
      id: 'tenant-abc',
      plan: 'free',
    });

    const event = makeStripeEvent('customer.subscription.updated', {
      id: 'sub_test_789',
      customer: 'cus_stripe_789',
      status: 'active',
      items: {
        data: [
          {
            price: { id: 'price_generic_monthly' },
          },
        ],
      },
      metadata: { plan: 'enterprise' },
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('plan_updated_to_enterprise');
  });

  it('should downgrade to free on customer.subscription.deleted', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue({
      id: 'tenant-abc',
      plan: 'pro',
    });

    const event = makeStripeEvent('customer.subscription.deleted', {
      id: 'sub_test_123',
      customer: 'cus_stripe_123',
      status: 'canceled',
      items: { data: [] },
      metadata: {},
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('downgraded_to_free');
    expect(tenantService.updatePlan).toHaveBeenCalledOnce();
    expect(tenantService.updatePlan).toHaveBeenCalledWith('tenant-abc', 'free');
  });

  it('should downgrade after 3 failed payment attempts', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue({
      id: 'tenant-abc',
      plan: 'pro',
    });

    const event = makeStripeEvent('invoice.payment_failed', {
      id: 'in_test_123',
      customer: 'cus_stripe_123',
      attempt_count: 3,
      status: 'open',
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('downgraded_after_payment_failure');
    expect(tenantService.updatePlan).toHaveBeenCalledOnce();
    expect(tenantService.updatePlan).toHaveBeenCalledWith('tenant-abc', 'free');
  });

  it('should only warn on payment failure with < 3 attempts', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue({
      id: 'tenant-abc',
      plan: 'pro',
    });

    const event = makeStripeEvent('invoice.payment_failed', {
      id: 'in_test_456',
      customer: 'cus_stripe_456',
      attempt_count: 1,
      status: 'open',
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('payment_failed_warning');
    expect(tenantService.updatePlan).not.toHaveBeenCalled();
  });

  it('should ignore unknown event types', async () => {
    const event = makeStripeEvent('charge.refunded', {
      id: 'ch_test_123',
      amount: 5000,
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(false);
    expect(result.action).toBeUndefined();
    expect(tenantService.setStripeCustomerId).not.toHaveBeenCalled();
    expect(tenantService.updatePlan).not.toHaveBeenCalled();
    expect(tenantService.getByStripeCustomerId).not.toHaveBeenCalled();
  });

  it('should handle missing tenant gracefully on subscription.updated', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue(null);

    const event = makeStripeEvent('customer.subscription.updated', {
      id: 'sub_test_orphan',
      customer: 'cus_unknown',
      status: 'active',
      items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      metadata: {},
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(false);
    expect(tenantService.updatePlan).not.toHaveBeenCalled();
  });

  it('should handle missing tenant gracefully on subscription.deleted', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue(null);

    const event = makeStripeEvent('customer.subscription.deleted', {
      id: 'sub_test_orphan',
      customer: 'cus_unknown',
      status: 'canceled',
      items: { data: [] },
      metadata: {},
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(false);
    expect(tenantService.updatePlan).not.toHaveBeenCalled();
  });

  it('should handle missing tenant gracefully on invoice.payment_failed', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue(null);

    const event = makeStripeEvent('invoice.payment_failed', {
      id: 'in_test_orphan',
      customer: 'cus_unknown',
      attempt_count: 5,
      status: 'open',
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(false);
    expect(tenantService.updatePlan).not.toHaveBeenCalled();
  });

  it('should downgrade to free when subscription status is not active or trialing', async () => {
    tenantService.getByStripeCustomerId.mockResolvedValue({
      id: 'tenant-abc',
      plan: 'pro',
    });

    const event = makeStripeEvent('customer.subscription.updated', {
      id: 'sub_test_pastdue',
      customer: 'cus_stripe_123',
      status: 'past_due',
      items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      metadata: {},
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('plan_updated_to_free');
    expect(tenantService.updatePlan).toHaveBeenCalledWith('tenant-abc', 'free');
  });

  it('should handle missing customer on invoice.payment_failed gracefully', async () => {
    const event = makeStripeEvent('invoice.payment_failed', {
      id: 'in_test_nocustomer',
      customer: '',
      attempt_count: 5,
      status: 'open',
    });

    const result = await handler.handleEvent(event);

    expect(result.handled).toBe(false);
  });
});
