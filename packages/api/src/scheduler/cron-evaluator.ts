import { CronExpressionParser } from 'cron-parser';

/**
 * Evaluates cron expressions with timezone support.
 *
 * Uses cron-parser v5 (`CronExpressionParser.parse`) to validate expressions,
 * compute next/previous run times, and determine whether a schedule is due.
 */
export class CronEvaluator {
  /**
   * Returns true if the given string is a valid cron expression.
   */
  isValidExpression(expression: string): boolean {
    try {
      if (!expression || !expression.trim()) return false;
      CronExpressionParser.parse(expression);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Computes the next scheduled run time after `from` in the given timezone.
   * Returns `undefined` if the expression is invalid.
   */
  getNextRunTime(
    expression: string,
    timezone: string,
    from: Date = new Date(),
  ): Date | undefined {
    try {
      const interval = CronExpressionParser.parse(expression, {
        currentDate: from,
        tz: timezone,
      });
      return interval.next().toDate();
    } catch {
      return undefined;
    }
  }

  /**
   * Computes the most recent scheduled run time before `from` in the given timezone.
   * Returns `undefined` if the expression is invalid.
   */
  getPreviousRunTime(
    expression: string,
    timezone: string,
    from: Date = new Date(),
  ): Date | undefined {
    try {
      const interval = CronExpressionParser.parse(expression, {
        currentDate: from,
        tz: timezone,
      });
      return interval.prev().toDate();
    } catch {
      return undefined;
    }
  }

  /**
   * Determines whether a cron schedule is due for execution.
   *
   * A schedule is due when:
   *  - It has never run before (`lastRunAt` is null), OR
   *  - The most recent scheduled time (before `now`) is after `lastRunAt`
   *    (meaning a scheduled slot has passed since the last execution).
   */
  isDue(
    expression: string,
    timezone: string,
    lastRunAt: Date | null,
    now: Date = new Date(),
  ): boolean {
    try {
      const prev = this.getPreviousRunTime(expression, timezone, now);
      if (!prev) return false;
      if (lastRunAt === null) return true;
      return prev.getTime() > lastRunAt.getTime();
    } catch {
      return false;
    }
  }
}
