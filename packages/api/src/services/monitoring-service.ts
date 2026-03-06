import { randomUUID } from 'node:crypto';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type ComparisonOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  comparison: ComparisonOp;
  severity: AlertSeverity;
  enabled: boolean;
}

export interface AlertTriggered {
  rule: AlertRule;
  currentValue: number;
  timestamp: Date;
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export class MonitoringService {
  private rules: Map<string, AlertRule> = new Map();
  private metrics: MetricPoint[] = [];
  private maxMetricHistory = 10000;

  recordMetric(
    name: string,
    value: number,
    tags?: Record<string, string>,
  ): void {
    this.metrics.push({ name, value, timestamp: new Date(), tags });
    // Keep bounded history
    if (this.metrics.length > this.maxMetricHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricHistory);
    }
  }

  evaluateAlerts(): AlertTriggered[] {
    const triggered: AlertTriggered[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Get latest metric value for the rule's metric
      const latestMetric = this.getLatestMetric(rule.metric);
      if (latestMetric === null) continue;

      if (this.checkThreshold(latestMetric, rule.threshold, rule.comparison)) {
        triggered.push({
          rule,
          currentValue: latestMetric,
          timestamp: new Date(),
        });
      }
    }

    return triggered;
  }

  private checkThreshold(
    value: number,
    threshold: number,
    comparison: ComparisonOp,
  ): boolean {
    switch (comparison) {
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return value === threshold;
    }
  }

  private getLatestMetric(name: string): number | null {
    for (let i = this.metrics.length - 1; i >= 0; i--) {
      if (this.metrics[i]!.name === name) return this.metrics[i]!.value;
    }
    return null;
  }

  getAlertRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  addAlertRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const fullRule: AlertRule = { ...rule, id: randomUUID() };
    this.rules.set(fullRule.id, fullRule);
    return fullRule;
  }

  removeAlertRule(id: string): boolean {
    return this.rules.delete(id);
  }

  getMetricHistory(name: string, limit?: number): MetricPoint[] {
    const filtered = this.metrics.filter((m) => m.name === name);
    return limit ? filtered.slice(-limit) : filtered;
  }
}
