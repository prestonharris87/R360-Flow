export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  details?: string;
}

export interface HealthChecker {
  name: string;
  check(): Promise<ComponentHealth>;
}

export interface MetricsSummary {
  uptime: number;
  requestCount: number;
  errorCount: number;
  avgResponseTimeMs: number;
}

export class HealthService {
  private checkers: HealthChecker[] = [];
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private totalResponseTimeMs = 0;

  addChecker(checker: HealthChecker): void {
    this.checkers.push(checker);
  }

  recordRequest(responseTimeMs: number, isError: boolean): void {
    this.requestCount++;
    this.totalResponseTimeMs += responseTimeMs;
    if (isError) this.errorCount++;
  }

  async check(): Promise<{ status: HealthStatus; components: ComponentHealth[] }> {
    const components: ComponentHealth[] = [];
    let overallStatus: HealthStatus = 'healthy';

    for (const checker of this.checkers) {
      try {
        const result = await checker.check();
        components.push(result);
        if (result.status === 'unhealthy') overallStatus = 'unhealthy';
        else if (result.status === 'degraded' && overallStatus !== 'unhealthy') overallStatus = 'degraded';
      } catch (err) {
        components.push({ name: checker.name, status: 'unhealthy', details: String(err) });
        overallStatus = 'unhealthy';
      }
    }

    // If no checkers, report healthy
    if (components.length === 0) {
      components.push({ name: 'api', status: 'healthy' });
    }

    return { status: overallStatus, components };
  }

  getMetrics(): MetricsSummary {
    return {
      uptime: Date.now() - this.startTime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      avgResponseTimeMs: this.requestCount > 0 ? Math.round(this.totalResponseTimeMs / this.requestCount) : 0,
    };
  }
}
