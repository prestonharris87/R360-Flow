import { describe, it, expect, beforeEach } from 'vitest';
import { MonitoringService } from '../../services/monitoring-service.js';
import type {
  ComparisonOp,
  AlertSeverity,
} from '../../services/monitoring-service.js';

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    service = new MonitoringService();
  });

  it('should record metrics', () => {
    service.recordMetric('cpu_usage', 72.5, { host: 'server-1' });
    service.recordMetric('memory_usage', 45.0);

    const cpuHistory = service.getMetricHistory('cpu_usage');
    const memHistory = service.getMetricHistory('memory_usage');

    expect(cpuHistory).toHaveLength(1);
    expect(cpuHistory[0]!.name).toBe('cpu_usage');
    expect(cpuHistory[0]!.value).toBe(72.5);
    expect(cpuHistory[0]!.tags).toEqual({ host: 'server-1' });
    expect(cpuHistory[0]!.timestamp).toBeInstanceOf(Date);

    expect(memHistory).toHaveLength(1);
    expect(memHistory[0]!.value).toBe(45.0);
    expect(memHistory[0]!.tags).toBeUndefined();
  });

  it('should get metric history', () => {
    service.recordMetric('requests', 100);
    service.recordMetric('requests', 150);
    service.recordMetric('requests', 200);
    service.recordMetric('errors', 5);

    const requestHistory = service.getMetricHistory('requests');
    const errorHistory = service.getMetricHistory('errors');

    expect(requestHistory).toHaveLength(3);
    expect(requestHistory[0]!.value).toBe(100);
    expect(requestHistory[1]!.value).toBe(150);
    expect(requestHistory[2]!.value).toBe(200);

    expect(errorHistory).toHaveLength(1);
    expect(errorHistory[0]!.value).toBe(5);
  });

  it('should limit metric history', () => {
    service.recordMetric('requests', 100);
    service.recordMetric('requests', 200);
    service.recordMetric('requests', 300);
    service.recordMetric('requests', 400);
    service.recordMetric('requests', 500);

    const limited = service.getMetricHistory('requests', 3);

    expect(limited).toHaveLength(3);
    // Should return the last 3 entries
    expect(limited[0]!.value).toBe(300);
    expect(limited[1]!.value).toBe(400);
    expect(limited[2]!.value).toBe(500);
  });

  it('should add alert rules', () => {
    const rule = service.addAlertRule({
      name: 'High CPU',
      metric: 'cpu_usage',
      threshold: 90,
      comparison: 'gt',
      severity: 'critical',
      enabled: true,
    });

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('High CPU');
    expect(rule.metric).toBe('cpu_usage');
    expect(rule.threshold).toBe(90);
    expect(rule.comparison).toBe('gt');
    expect(rule.severity).toBe('critical');
    expect(rule.enabled).toBe(true);

    const rules = service.getAlertRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(rule.id);
  });

  it('should remove alert rules', () => {
    const rule1 = service.addAlertRule({
      name: 'High CPU',
      metric: 'cpu_usage',
      threshold: 90,
      comparison: 'gt',
      severity: 'critical',
      enabled: true,
    });
    const rule2 = service.addAlertRule({
      name: 'Low Disk',
      metric: 'disk_free',
      threshold: 10,
      comparison: 'lt',
      severity: 'warning',
      enabled: true,
    });

    expect(service.getAlertRules()).toHaveLength(2);

    const removed = service.removeAlertRule(rule1.id);
    expect(removed).toBe(true);
    expect(service.getAlertRules()).toHaveLength(1);
    expect(service.getAlertRules()[0]!.id).toBe(rule2.id);

    // Removing non-existent rule returns false
    const removedAgain = service.removeAlertRule(rule1.id);
    expect(removedAgain).toBe(false);
  });

  it('should evaluate alerts - greater than threshold triggers', () => {
    service.addAlertRule({
      name: 'High CPU',
      metric: 'cpu_usage',
      threshold: 80,
      comparison: 'gt',
      severity: 'critical',
      enabled: true,
    });

    // Record a metric that exceeds the threshold
    service.recordMetric('cpu_usage', 95);

    const triggered = service.evaluateAlerts();

    expect(triggered).toHaveLength(1);
    expect(triggered[0]!.rule.name).toBe('High CPU');
    expect(triggered[0]!.currentValue).toBe(95);
    expect(triggered[0]!.timestamp).toBeInstanceOf(Date);
  });

  it('should evaluate alerts - less than threshold triggers', () => {
    service.addAlertRule({
      name: 'Low Disk Space',
      metric: 'disk_free_pct',
      threshold: 20,
      comparison: 'lt',
      severity: 'warning',
      enabled: true,
    });

    service.recordMetric('disk_free_pct', 8);

    const triggered = service.evaluateAlerts();

    expect(triggered).toHaveLength(1);
    expect(triggered[0]!.rule.name).toBe('Low Disk Space');
    expect(triggered[0]!.currentValue).toBe(8);
  });

  it('should not trigger disabled alert rules', () => {
    service.addAlertRule({
      name: 'High CPU',
      metric: 'cpu_usage',
      threshold: 80,
      comparison: 'gt',
      severity: 'critical',
      enabled: false,
    });

    service.recordMetric('cpu_usage', 95);

    const triggered = service.evaluateAlerts();
    expect(triggered).toHaveLength(0);
  });

  it('should not trigger when no matching metric', () => {
    service.addAlertRule({
      name: 'High CPU',
      metric: 'cpu_usage',
      threshold: 80,
      comparison: 'gt',
      severity: 'critical',
      enabled: true,
    });

    // Record a different metric, not cpu_usage
    service.recordMetric('memory_usage', 95);

    const triggered = service.evaluateAlerts();
    expect(triggered).toHaveLength(0);
  });

  it('should support all comparison operators', () => {
    const testCases: Array<{
      comparison: ComparisonOp;
      threshold: number;
      value: number;
      shouldTrigger: boolean;
    }> = [
      { comparison: 'gt', threshold: 50, value: 60, shouldTrigger: true },
      { comparison: 'gt', threshold: 50, value: 50, shouldTrigger: false },
      { comparison: 'gt', threshold: 50, value: 40, shouldTrigger: false },
      { comparison: 'gte', threshold: 50, value: 50, shouldTrigger: true },
      { comparison: 'gte', threshold: 50, value: 60, shouldTrigger: true },
      { comparison: 'gte', threshold: 50, value: 40, shouldTrigger: false },
      { comparison: 'lt', threshold: 50, value: 40, shouldTrigger: true },
      { comparison: 'lt', threshold: 50, value: 50, shouldTrigger: false },
      { comparison: 'lt', threshold: 50, value: 60, shouldTrigger: false },
      { comparison: 'lte', threshold: 50, value: 50, shouldTrigger: true },
      { comparison: 'lte', threshold: 50, value: 40, shouldTrigger: true },
      { comparison: 'lte', threshold: 50, value: 60, shouldTrigger: false },
      { comparison: 'eq', threshold: 50, value: 50, shouldTrigger: true },
      { comparison: 'eq', threshold: 50, value: 49, shouldTrigger: false },
    ];

    for (const tc of testCases) {
      const svc = new MonitoringService();
      const metricName = `test_${tc.comparison}_${tc.value}`;

      svc.addAlertRule({
        name: `Test ${tc.comparison}`,
        metric: metricName,
        threshold: tc.threshold,
        comparison: tc.comparison,
        severity: 'info',
        enabled: true,
      });

      svc.recordMetric(metricName, tc.value);

      const triggered = svc.evaluateAlerts();
      expect(
        triggered.length > 0,
        `Expected ${tc.comparison} (value=${tc.value}, threshold=${tc.threshold}) to ${tc.shouldTrigger ? 'trigger' : 'not trigger'}`,
      ).toBe(tc.shouldTrigger);
    }
  });

  it('should support alert severity levels', () => {
    const severities: AlertSeverity[] = ['info', 'warning', 'critical'];

    for (const severity of severities) {
      const rule = service.addAlertRule({
        name: `${severity} alert`,
        metric: `metric_${severity}`,
        threshold: 50,
        comparison: 'gt',
        severity,
        enabled: true,
      });

      expect(rule.severity).toBe(severity);

      service.recordMetric(`metric_${severity}`, 100);
    }

    const triggered = service.evaluateAlerts();
    expect(triggered).toHaveLength(3);

    const triggeredSeverities = triggered.map((t) => t.rule.severity);
    expect(triggeredSeverities).toContain('info');
    expect(triggeredSeverities).toContain('warning');
    expect(triggeredSeverities).toContain('critical');
  });

  it('should bound metric history to max size', () => {
    // The default maxMetricHistory is 10000, so we need to exceed it
    // We access the service internals by recording more than the max
    const totalMetrics = 10050;

    for (let i = 0; i < totalMetrics; i++) {
      service.recordMetric('load', i);
    }

    const history = service.getMetricHistory('load');

    // Should be bounded to maxMetricHistory (10000)
    expect(history.length).toBeLessThanOrEqual(10000);
    // The oldest metrics should have been trimmed
    // After recording 10050 metrics, the first 50 are discarded
    expect(history[0]!.value).toBe(50);
    expect(history[history.length - 1]!.value).toBe(10049);
  });
});
