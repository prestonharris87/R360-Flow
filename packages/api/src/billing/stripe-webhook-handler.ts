import type Stripe from 'stripe';

export interface TenantServiceInterface {
  setStripeCustomerId(tenantId: string, customerId: string): Promise<void>;
  updatePlan(tenantId: string, plan: string): Promise<void>;
  getByStripeCustomerId(customerId: string): Promise<{ id: string; plan: string } | null>;
}

export interface UsageTrackerInterface {
  getCurrentUsage(tenantId: string): Promise<{ executionCount: number }>;
}

export class StripeWebhookHandler {
  /** Reserved for metered billing / overage checks in a future phase. */
  readonly usageTracker: UsageTrackerInterface;

  constructor(
    private tenantService: TenantServiceInterface,
    usageTracker: UsageTrackerInterface,
  ) {
    this.usageTracker = usageTracker;
  }

  async handleEvent(event: Stripe.Event): Promise<{ handled: boolean; action?: string }> {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      case 'customer.subscription.updated':
        return this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      case 'invoice.payment_failed':
        return this.handlePaymentFailed(event.data.object as Stripe.Invoice);
      default:
        return { handled: false };
    }
  }

  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<{ handled: boolean; action?: string }> {
    const tenantId = session.client_reference_id;
    const customerId = session.customer as string;
    if (!tenantId || !customerId) return { handled: false };

    await this.tenantService.setStripeCustomerId(tenantId, customerId);
    return { handled: true, action: 'stripe_customer_linked' };
  }

  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<{ handled: boolean; action?: string }> {
    const customerId = subscription.customer as string;
    const tenant = await this.tenantService.getByStripeCustomerId(customerId);
    if (!tenant) return { handled: false };

    // Map Stripe price/product to plan
    const plan = this.mapSubscriptionToPlan(subscription);
    await this.tenantService.updatePlan(tenant.id, plan);
    return { handled: true, action: `plan_updated_to_${plan}` };
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<{ handled: boolean; action?: string }> {
    const customerId = subscription.customer as string;
    const tenant = await this.tenantService.getByStripeCustomerId(customerId);
    if (!tenant) return { handled: false };

    await this.tenantService.updatePlan(tenant.id, 'free');
    return { handled: true, action: 'downgraded_to_free' };
  }

  private async handlePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<{ handled: boolean; action?: string }> {
    const customerId = invoice.customer as string;
    if (!customerId) return { handled: false };

    const tenant = await this.tenantService.getByStripeCustomerId(customerId);
    if (!tenant) return { handled: false };

    const attemptCount = invoice.attempt_count ?? 0;
    if (attemptCount >= 3) {
      await this.tenantService.updatePlan(tenant.id, 'free');
      return { handled: true, action: 'downgraded_after_payment_failure' };
    }
    return { handled: true, action: 'payment_failed_warning' };
  }

  private mapSubscriptionToPlan(subscription: Stripe.Subscription): string {
    const status = subscription.status;
    if (status !== 'active' && status !== 'trialing') return 'free';

    // Check metadata for plan or use price lookup
    const item = subscription.items?.data?.[0];
    const priceId = item?.price?.id ?? '';

    if (priceId.includes('enterprise')) return 'enterprise';
    if (priceId.includes('pro')) return 'pro';

    // Check metadata
    const planMeta = subscription.metadata?.plan;
    if (planMeta === 'enterprise') return 'enterprise';
    if (planMeta === 'pro') return 'pro';

    return 'pro'; // Default for active subscriptions
  }
}
