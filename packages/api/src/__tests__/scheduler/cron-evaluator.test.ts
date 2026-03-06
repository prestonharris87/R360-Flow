import { describe, it, expect } from 'vitest';
import { CronEvaluator } from '../../scheduler/cron-evaluator.js';

describe('CronEvaluator', () => {
  const evaluator = new CronEvaluator();

  describe('isValidExpression', () => {
    it('returns true for a valid cron expression', () => {
      expect(evaluator.isValidExpression('0 9 * * *')).toBe(true);
    });

    it('returns true for an every-5-minutes expression', () => {
      expect(evaluator.isValidExpression('*/5 * * * *')).toBe(true);
    });

    it('returns false for an invalid cron expression', () => {
      expect(evaluator.isValidExpression('not a cron')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(evaluator.isValidExpression('')).toBe(false);
    });
  });

  describe('getNextRunTime', () => {
    it('calculates next run for daily 9am cron when current time is 8:00 UTC', () => {
      // "0 9 * * *" = every day at 09:00
      // from 2025-06-15T08:00:00Z -> next should be 2025-06-15T09:00:00Z
      const from = new Date('2025-06-15T08:00:00.000Z');
      const next = evaluator.getNextRunTime('0 9 * * *', 'UTC', from);

      expect(next).toBeDefined();
      expect(next!.toISOString()).toBe('2025-06-15T09:00:00.000Z');
    });

    it('calculates next run for every-5-minutes cron at :03', () => {
      // "*/5 * * * *" = every 5 minutes (:00, :05, :10, ...)
      // from 2025-06-15T12:03:00Z -> next should be 2025-06-15T12:05:00Z
      const from = new Date('2025-06-15T12:03:00.000Z');
      const next = evaluator.getNextRunTime('*/5 * * * *', 'UTC', from);

      expect(next).toBeDefined();
      expect(next!.toISOString()).toBe('2025-06-15T12:05:00.000Z');
    });

    it('returns undefined for an invalid expression', () => {
      const result = evaluator.getNextRunTime('invalid', 'UTC');
      expect(result).toBeUndefined();
    });
  });

  describe('getPreviousRunTime', () => {
    it('calculates previous run for daily 9am cron when current time is 10:00 UTC', () => {
      const from = new Date('2025-06-15T10:00:00.000Z');
      const prev = evaluator.getPreviousRunTime('0 9 * * *', 'UTC', from);

      expect(prev).toBeDefined();
      expect(prev!.toISOString()).toBe('2025-06-15T09:00:00.000Z');
    });

    it('returns undefined for an invalid expression', () => {
      const result = evaluator.getPreviousRunTime('bad cron', 'UTC');
      expect(result).toBeUndefined();
    });
  });

  describe('isDue', () => {
    it('returns true when lastRunAt is null (never ran)', () => {
      // "*/5 * * * *" at 12:06 -> prev is 12:05, lastRunAt is null -> due
      const now = new Date('2025-06-15T12:06:00.000Z');
      const result = evaluator.isDue('*/5 * * * *', 'UTC', null, now);
      expect(result).toBe(true);
    });

    it('returns true when lastRunAt is before the most recent scheduled time', () => {
      // "*/5 * * * *" at 12:06 -> prev is 12:05
      // lastRunAt is 12:00 (before 12:05) -> should be due
      const now = new Date('2025-06-15T12:06:00.000Z');
      const lastRunAt = new Date('2025-06-15T12:00:00.000Z');
      const result = evaluator.isDue('*/5 * * * *', 'UTC', lastRunAt, now);
      expect(result).toBe(true);
    });

    it('returns false when already ran in this window', () => {
      // "*/5 * * * *" at 12:06 -> prev is 12:05
      // lastRunAt is 12:05 (equal to prev) -> NOT due (prev is not > lastRunAt)
      const now = new Date('2025-06-15T12:06:00.000Z');
      const lastRunAt = new Date('2025-06-15T12:05:00.000Z');
      const result = evaluator.isDue('*/5 * * * *', 'UTC', lastRunAt, now);
      expect(result).toBe(false);
    });

    it('returns false when lastRunAt is after the most recent scheduled time', () => {
      // "*/5 * * * *" at 12:06 -> prev is 12:05
      // lastRunAt is 12:05:30 (after 12:05) -> NOT due
      const now = new Date('2025-06-15T12:06:00.000Z');
      const lastRunAt = new Date('2025-06-15T12:05:30.000Z');
      const result = evaluator.isDue('*/5 * * * *', 'UTC', lastRunAt, now);
      expect(result).toBe(false);
    });

    it('returns false for an invalid expression', () => {
      const result = evaluator.isDue('invalid', 'UTC', null);
      expect(result).toBe(false);
    });
  });

  describe('timezone support', () => {
    it('respects timezone when calculating next run time', () => {
      // "0 9 * * *" in America/New_York
      // From 2025-06-15T12:00:00Z (which is 8:00 AM ET during DST)
      // Next 9:00 AM ET = 2025-06-15T13:00:00Z
      const from = new Date('2025-06-15T12:00:00.000Z');
      const next = evaluator.getNextRunTime('0 9 * * *', 'America/New_York', from);

      expect(next).toBeDefined();
      expect(next!.toISOString()).toBe('2025-06-15T13:00:00.000Z');
    });
  });
});
