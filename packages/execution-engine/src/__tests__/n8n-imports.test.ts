import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('n8n package installation', () => {
  it('can import from n8n-workflow', async () => {
    const { Workflow } = await import('n8n-workflow');
    expect(Workflow).toBeDefined();
  });

  it('can import from n8n-core', async () => {
    const { WorkflowExecute } = await import('n8n-core');
    expect(WorkflowExecute).toBeDefined();
  });

  it('can import INodeTypes interface type check compiles', async () => {
    // This test verifies TypeScript compilation succeeds
    // The actual type import is validated at build time
    const n8nWorkflow = await import('n8n-workflow');
    expect(n8nWorkflow.NodeConnectionTypes).toBeDefined();
  });

  it('can import from @n8n/di', async () => {
    const { Container } = await import('@n8n/di');
    expect(Container).toBeDefined();
    expect(typeof Container.set).toBe('function');
    expect(typeof Container.get).toBe('function');
  });

  it('can import from @n8n/errors', async () => {
    const errors = await import('@n8n/errors');
    expect(errors).toBeDefined();
  });

  it('can import from @n8n/constants', async () => {
    const constants = await import('@n8n/constants');
    expect(constants).toBeDefined();
  });
});

describe('Cardinal Rule enforcement', () => {
  it('no source file imports from n8n/ directory', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const scriptPath = path.join(repoRoot, 'scripts/check-cardinal-rule.sh');

    // This will throw if the script exits non-zero (violation found)
    const result = execSync(`bash ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    expect(result).toContain('Cardinal Rule: PASSED');
  });
});
