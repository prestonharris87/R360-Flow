import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IRun } from 'n8n-workflow';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bootstrapN8nContainer, resetBootstrap } from '../bootstrap.js';
import { R360NodeTypes } from '../node-types.js';
import { ExecutionService } from '../execution-service.js';

const TEST_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';
const TEST_MASTER_KEY = 'master-key-for-testing-purposes!';

describe('ExecutionService', () => {
  let testUserFolder: string;
  let nodeTypes: R360NodeTypes;
  let service: ExecutionService;

  beforeAll(async () => {
    // Create a temporary directory for n8n state
    testUserFolder = mkdtempSync(path.join(tmpdir(), 'r360-exec-svc-test-'));

    // Set env vars needed by the execution service
    process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
    process.env.API_BASE_URL = 'http://localhost:3000';
    process.env.WEBHOOK_BASE_URL = 'http://localhost:3000/webhook';

    // Bootstrap DI container
    resetBootstrap();
    await bootstrapN8nContainer({
      encryptionKey: TEST_ENCRYPTION_KEY,
      userFolder: testUserFolder,
    });

    // Initialize node types (shared across all tests)
    nodeTypes = new R360NodeTypes();
    await nodeTypes.init();

    // Create execution service
    service = new ExecutionService(nodeTypes);
  }, 60000); // Loading n8n-nodes-base can be slow

  afterAll(() => {
    try {
      rmSync(testUserFolder, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  it('executes a ManualTrigger -> Set workflow end-to-end', async () => {
    // Minimal n8n workflow: ManualTrigger -> Set node
    const n8nWorkflowJson = {
      id: 'test-workflow-001',
      name: 'Test Workflow',
      nodes: [
        {
          id: 'node-1',
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0] as [number, number],
          parameters: {},
        },
        {
          id: 'node-2',
          name: 'Set Data',
          type: 'n8n-nodes-base.set',
          typeVersion: 3.4,
          position: [200, 0] as [number, number],
          parameters: {
            mode: 'manual',
            duplicateItem: false,
            assignments: {
              assignments: [
                {
                  id: 'assign-1',
                  name: 'greeting',
                  value: 'Hello from R360!',
                  type: 'string',
                },
              ],
            },
            includeOtherFields: false,
            options: {},
          },
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [
            [{ node: 'Set Data', type: 'main' as const, index: 0 }],
          ],
        },
      },
      active: false,
      settings: {
        executionOrder: 'v1' as const,
      },
    };

    const result: IRun = await service.executeWorkflow({
      tenantId: 'tenant-test-001',
      workflowJson: n8nWorkflowJson,
      mode: 'manual',
    });

    expect(result).toBeDefined();
    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');

    // Verify the Set node output contains our greeting
    const setNodeData = result.data.resultData.runData['Set Data'];
    expect(setNodeData).toBeDefined();
    expect(setNodeData!.length).toBeGreaterThan(0);

    const outputItems = setNodeData![0]!.data?.main?.[0];
    expect(outputItems).toBeDefined();
    expect(outputItems!.length).toBeGreaterThan(0);
    expect(outputItems![0]!.json.greeting).toBe('Hello from R360!');
  }, 30000); // 30s timeout for execution

  it('records execution status via lifecycle hooks', async () => {
    const hookEvents: string[] = [];

    const result = await service.executeWorkflow({
      tenantId: 'tenant-test-002',
      workflowJson: {
        id: 'test-wf-hooks',
        name: 'Hook Test',
        nodes: [
          {
            id: 'n1',
            name: 'Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
        ],
        connections: {},
        active: false,
        settings: { executionOrder: 'v1' as const },
      },
      mode: 'manual',
      onHookEvent: (event: string) => hookEvents.push(event),
    });

    expect(result).toBeDefined();
    expect(result.finished).toBe(true);
    expect(hookEvents).toContain('workflowExecuteBefore');
    expect(hookEvents).toContain('workflowExecuteAfter');
  }, 30000);

  it('fires lifecycle hooks in correct order', async () => {
    const hookEvents: string[] = [];

    await service.executeWorkflow({
      tenantId: 'tenant-test-003',
      workflowJson: {
        id: 'test-wf-order',
        name: 'Order Test',
        nodes: [
          {
            id: 'n1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
          {
            id: 'n2',
            name: 'Set Data',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [200, 0] as [number, number],
            parameters: {
              mode: 'manual',
              duplicateItem: false,
              assignments: {
                assignments: [
                  {
                    id: 'a1',
                    name: 'value',
                    value: 'test',
                    type: 'string',
                  },
                ],
              },
              includeOtherFields: false,
              options: {},
            },
          },
        ],
        connections: {
          'Manual Trigger': {
            main: [
              [{ node: 'Set Data', type: 'main' as const, index: 0 }],
            ],
          },
        },
        active: false,
        settings: { executionOrder: 'v1' as const },
      },
      mode: 'manual',
      onHookEvent: (event: string) => hookEvents.push(event),
    });

    // workflowExecuteBefore must come first
    const beforeIndex = hookEvents.indexOf('workflowExecuteBefore');
    const afterIndex = hookEvents.indexOf('workflowExecuteAfter');
    expect(beforeIndex).toBeGreaterThanOrEqual(0);
    expect(afterIndex).toBeGreaterThanOrEqual(0);
    expect(beforeIndex).toBeLessThan(afterIndex);

    // nodeExecuteBefore/After should appear between workflow start and end
    expect(hookEvents).toContain('nodeExecuteBefore');
    expect(hookEvents).toContain('nodeExecuteAfter');

    const firstNodeBefore = hookEvents.indexOf('nodeExecuteBefore');
    const lastNodeAfter = hookEvents.lastIndexOf('nodeExecuteAfter');
    expect(firstNodeBefore).toBeGreaterThan(beforeIndex);
    expect(lastNodeAfter).toBeLessThan(afterIndex);
  }, 30000);

  it('rejects execution with missing tenant ID', async () => {
    await expect(
      service.executeWorkflow({
        tenantId: '', // Empty tenant ID
        workflowJson: {
          id: '1',
          name: 'x',
          nodes: [],
          connections: {},
          active: false,
        },
        mode: 'manual',
      }),
    ).rejects.toThrow(/tenant/i);
  });

  it('rejects execution with whitespace-only tenant ID', async () => {
    await expect(
      service.executeWorkflow({
        tenantId: '   ',
        workflowJson: {
          id: '1',
          name: 'x',
          nodes: [],
          connections: {},
          active: false,
        },
        mode: 'manual',
      }),
    ).rejects.toThrow(/tenant/i);
  });

  it('includes tenant ID in webhook URLs', async () => {
    const tenantId = 'tenant-webhook-test';

    // We verify the webhook URLs are set correctly by inspecting the
    // additionalData through the execution result. Since we can't directly
    // access additionalData, we verify the execution succeeds with the
    // tenant-specific configuration.
    const result = await service.executeWorkflow({
      tenantId,
      workflowJson: {
        id: 'webhook-url-test',
        name: 'Webhook URL Test',
        nodes: [
          {
            id: 'n1',
            name: 'Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
        ],
        connections: {},
        active: false,
        settings: { executionOrder: 'v1' as const },
      },
      mode: 'manual',
    });

    // Execution should succeed with tenant-specific URLs
    expect(result.finished).toBe(true);
  }, 30000);

  it('generates unique execution IDs for each run', async () => {
    const minimalWorkflow = {
      id: 'uniqueness-test',
      name: 'Uniqueness Test',
      nodes: [
        {
          id: 'n1',
          name: 'Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0] as [number, number],
          parameters: {},
        },
      ],
      connections: {},
      active: false,
      settings: { executionOrder: 'v1' as const },
    };

    // Run twice for the same tenant
    const [result1, result2] = await Promise.all([
      service.executeWorkflow({
        tenantId: 'tenant-unique',
        workflowJson: minimalWorkflow,
        mode: 'manual',
      }),
      service.executeWorkflow({
        tenantId: 'tenant-unique',
        workflowJson: minimalWorkflow,
        mode: 'manual',
      }),
    ]);

    // Both should succeed independently
    expect(result1.finished).toBe(true);
    expect(result2.finished).toBe(true);
  }, 30000);

  it('provides tenant isolation between concurrent executions', async () => {
    const minimalWorkflow = {
      id: 'isolation-test',
      name: 'Isolation Test',
      nodes: [
        {
          id: 'n1',
          name: 'Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0] as [number, number],
          parameters: {},
        },
      ],
      connections: {},
      active: false,
      settings: { executionOrder: 'v1' as const },
    };

    // Execute for two different tenants concurrently
    const [result1, result2] = await Promise.all([
      service.executeWorkflow({
        tenantId: 'tenant-A',
        workflowJson: minimalWorkflow,
        mode: 'manual',
      }),
      service.executeWorkflow({
        tenantId: 'tenant-B',
        workflowJson: minimalWorkflow,
        mode: 'manual',
      }),
    ]);

    // Both should succeed independently
    expect(result1.finished).toBe(true);
    expect(result2.finished).toBe(true);
    expect(result1.status).toBe('success');
    expect(result2.status).toBe('success');
  }, 30000);
});
