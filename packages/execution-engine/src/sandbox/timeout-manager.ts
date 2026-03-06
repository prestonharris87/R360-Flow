export interface TimeoutConfig {
  nodeTimeoutMs: number;
  workflowTimeoutMs: number;
}

interface WorkflowTimer {
  startTime: number;
  timeoutMs: number;
  timer: NodeJS.Timeout;
  timedOut: boolean;
}

/**
 * TimeoutManager enforces both per-node and per-workflow execution time limits.
 *
 * - Workflow timers are long-lived and tracked by `executionId`.
 * - Node timeouts are one-shot and scoped to a single async operation via
 *   `withNodeTimeout`.
 */
export class TimeoutManager {
  private workflowTimers: Map<string, WorkflowTimer> = new Map();

  /**
   * Start a workflow-level timer.  When the configured duration elapses the
   * timer is marked as timed-out (callers should poll `isWorkflowTimedOut`).
   */
  startWorkflowTimer(executionId: string, config: TimeoutConfig): void {
    const startTime = Date.now();
    const timer = setTimeout(() => {
      const entry = this.workflowTimers.get(executionId);
      if (entry) entry.timedOut = true;
    }, config.workflowTimeoutMs);

    // Prevent the timer from keeping the process alive during tests / shutdown.
    if (timer.unref) timer.unref();

    this.workflowTimers.set(executionId, {
      startTime,
      timeoutMs: config.workflowTimeoutMs,
      timer,
      timedOut: false,
    });
  }

  /**
   * Check whether a workflow execution has exceeded its time limit.
   */
  isWorkflowTimedOut(executionId: string): boolean {
    const entry = this.workflowTimers.get(executionId);
    if (!entry) return false;
    if (entry.timedOut) return true;
    return Date.now() - entry.startTime >= entry.timeoutMs;
  }

  /**
   * Clear (cancel) a workflow timer and remove it from tracking.
   */
  clearWorkflowTimer(executionId: string): void {
    const entry = this.workflowTimers.get(executionId);
    if (entry) {
      clearTimeout(entry.timer);
      this.workflowTimers.delete(executionId);
    }
  }

  /**
   * Execute an async operation with a per-node timeout.  If the operation
   * does not resolve within `config.nodeTimeoutMs` the returned promise
   * rejects with a descriptive error.
   */
  async withNodeTimeout<T>(
    nodeId: string,
    config: TimeoutConfig,
    operation: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Node ${nodeId} execution timeout after ${config.nodeTimeoutMs}ms`,
          ),
        );
      }, config.nodeTimeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Return the number of active (not yet cleared) workflow timers.
   */
  activeTimerCount(): number {
    return this.workflowTimers.size;
  }

  /**
   * Cancel and remove all active workflow timers.
   */
  clearAll(): void {
    for (const [id] of this.workflowTimers) {
      this.clearWorkflowTimer(id);
    }
  }
}
