import { describe, it, expect, afterEach } from 'vitest';
import { TimeoutManager, type TimeoutConfig } from '../../sandbox/timeout-manager.js';

describe('Timeout: TimeoutManager', () => {
  const manager = new TimeoutManager();

  afterEach(() => {
    manager.clearAll();
  });

  // ── Per-node timeout ──────────────────────────────────────────────────

  describe('withNodeTimeout', () => {
    it('rejects when operation exceeds the node timeout', async () => {
      const config: TimeoutConfig = { nodeTimeoutMs: 50, workflowTimeoutMs: 60000 };

      const slowOp = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('done'), 500);
        });

      await expect(
        manager.withNodeTimeout('node-1', config, slowOp),
      ).rejects.toThrow('Node node-1 execution timeout after 50ms');
    });

    it('resolves when operation finishes within the time limit', async () => {
      const config: TimeoutConfig = { nodeTimeoutMs: 5000, workflowTimeoutMs: 60000 };

      const fastOp = () => Promise.resolve('fast');

      const result = await manager.withNodeTimeout('node-2', config, fastOp);
      expect(result).toBe('fast');
    });

    it('propagates errors from the operation (not timeout)', async () => {
      const config: TimeoutConfig = { nodeTimeoutMs: 5000, workflowTimeoutMs: 60000 };

      const failOp = () => Promise.reject(new Error('op failed'));

      await expect(
        manager.withNodeTimeout('node-3', config, failOp),
      ).rejects.toThrow('op failed');
    });
  });

  // ── Per-workflow timeout ──────────────────────────────────────────────

  describe('workflow timers', () => {
    it('marks a workflow as timed out after the configured duration', async () => {
      const config: TimeoutConfig = { nodeTimeoutMs: 1000, workflowTimeoutMs: 50 };

      manager.startWorkflowTimer('exec-1', config);
      expect(manager.isWorkflowTimedOut('exec-1')).toBe(false);

      // Wait long enough for the timer to fire
      await new Promise((r) => setTimeout(r, 100));

      expect(manager.isWorkflowTimedOut('exec-1')).toBe(true);
    });

    it('returns false for unknown execution IDs', () => {
      expect(manager.isWorkflowTimedOut('nonexistent')).toBe(false);
    });

    it('clears a workflow timer so it does not fire', async () => {
      const config: TimeoutConfig = { nodeTimeoutMs: 1000, workflowTimeoutMs: 50 };

      manager.startWorkflowTimer('exec-2', config);
      manager.clearWorkflowTimer('exec-2');

      await new Promise((r) => setTimeout(r, 100));

      // After clearing, the entry is removed entirely
      expect(manager.isWorkflowTimedOut('exec-2')).toBe(false);
    });
  });

  // ── Active timer count ────────────────────────────────────────────────

  describe('activeTimerCount', () => {
    it('tracks the number of active workflow timers', () => {
      const config: TimeoutConfig = { nodeTimeoutMs: 1000, workflowTimeoutMs: 60000 };

      expect(manager.activeTimerCount()).toBe(0);

      manager.startWorkflowTimer('a', config);
      manager.startWorkflowTimer('b', config);
      expect(manager.activeTimerCount()).toBe(2);

      manager.clearWorkflowTimer('a');
      expect(manager.activeTimerCount()).toBe(1);

      manager.clearAll();
      expect(manager.activeTimerCount()).toBe(0);
    });
  });
});
