import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { IRun, INode, IConnections, INodeParameters } from 'n8n-workflow';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bootstrapN8nContainer, resetBootstrap } from '../bootstrap.js';
import { R360NodeTypes } from '../node-types.js';
import { ExecutionService } from '../execution-service.js';

const TEST_ENCRYPTION_KEY = 'test-e2e-encryption-key-min-32-chars!!';
const TEST_MASTER_KEY = 'master-key-for-e2e-testing-purposes!';

/**
 * End-to-end integration tests for the R360 Flow execution engine.
 *
 * These tests exercise the complete path from workflow definition through
 * n8n execution and result capture. They use REAL n8n packages (unmodified)
 * and verify actual workflow execution behavior.
 *
 * Test cases:
 * 1. Simple workflow execution (ManualTrigger -> Set)
 * 2. Multi-node chain (ManualTrigger -> Set -> Set)
 * 3. Expression evaluation (n8n expressions like {{ $json.name + " processed" }})
 * 4. Lifecycle hooks (nodeExecuteBefore / nodeExecuteAfter spy verification)
 * 5. Tenant isolation (two workflows with different tenantIds)
 *
 * Run with: pnpm test:e2e
 */
describe('E2E Execution', { timeout: 120000 }, () => {
  let testUserFolder: string;
  let nodeTypes: R360NodeTypes;
  let service: ExecutionService;

  beforeAll(async () => {
    testUserFolder = mkdtempSync(path.join(tmpdir(), 'r360-e2e-'));

    // Set env vars needed by the execution service
    process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
    process.env.API_BASE_URL = 'http://localhost:3000';
    process.env.WEBHOOK_BASE_URL = 'http://localhost:3000/webhook';

    // Bootstrap DI container (once for all tests)
    resetBootstrap();
    await bootstrapN8nContainer({
      encryptionKey: TEST_ENCRYPTION_KEY,
      userFolder: testUserFolder,
    });

    // Initialize node types (shared across all tests -- node types are stateless)
    nodeTypes = new R360NodeTypes();
    await nodeTypes.init();

    // Create execution service
    service = new ExecutionService(nodeTypes);
  }, 60000); // Loading n8n-nodes-base can be slow

  afterAll(() => {
    resetBootstrap();
    try {
      rmSync(testUserFolder, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  // ---------------------------------------------------------------------------
  // Test 1: Simple workflow execution
  // ---------------------------------------------------------------------------
  describe('simple workflow execution', () => {
    it('should execute ManualTrigger -> Set and produce expected output', async () => {
      const result: IRun = await service.executeWorkflow({
        tenantId: 'e2e-simple-tenant',
        workflowJson: {
          id: 'e2e-simple-001',
          name: 'Simple Workflow',
          nodes: [
            {
              id: 'node-trigger',
              name: 'Manual Trigger',
              type: 'n8n-nodes-base.manualTrigger',
              typeVersion: 1,
              position: [0, 0] as [number, number],
              parameters: {},
            },
            {
              id: 'node-set',
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
                      id: 'assign-greeting',
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
          settings: { executionOrder: 'v1' as const },
        },
        mode: 'manual',
      });

      // Verify execution completed successfully
      expect(result).toBeDefined();
      expect(result.finished).toBe(true);
      expect(result.status).toBe('success');

      // Verify no errors occurred
      expect(result.data.resultData.error).toBeUndefined();

      // Verify both nodes executed
      const runData = result.data.resultData.runData;
      expect(runData['Manual Trigger']).toBeDefined();
      expect(runData['Set Data']).toBeDefined();

      // Verify the Set node output contains our greeting
      const setNodeData = runData['Set Data'];
      expect(setNodeData).toBeDefined();
      expect(setNodeData!.length).toBeGreaterThan(0);

      const outputItems = setNodeData![0]!.data?.main?.[0];
      expect(outputItems).toBeDefined();
      expect(outputItems!.length).toBeGreaterThan(0);
      expect(outputItems![0]!.json.greeting).toBe('Hello from R360!');

      // Verify execution has timing data
      expect(result.startedAt).toBeDefined();
      expect(result.startedAt).toBeInstanceOf(Date);
    }, 30000);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Multi-node chain
  // ---------------------------------------------------------------------------
  describe('multi-node chain', () => {
    it('should execute ManualTrigger -> Set(name) -> Set(status) and apply both sets', async () => {
      const result: IRun = await service.executeWorkflow({
        tenantId: 'e2e-chain-tenant',
        workflowJson: {
          id: 'e2e-chain-001',
          name: 'Multi-Node Chain',
          nodes: [
            {
              id: 'chain-trigger',
              name: 'Manual Trigger',
              type: 'n8n-nodes-base.manualTrigger',
              typeVersion: 1,
              position: [0, 0] as [number, number],
              parameters: {},
            },
            {
              id: 'chain-set-name',
              name: 'Set Name',
              type: 'n8n-nodes-base.set',
              typeVersion: 3.4,
              position: [200, 0] as [number, number],
              parameters: {
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    {
                      id: 'assign-name',
                      name: 'name',
                      value: 'test',
                      type: 'string',
                    },
                  ],
                },
                includeOtherFields: false,
                options: {},
              },
            },
            {
              id: 'chain-set-status',
              name: 'Set Status',
              type: 'n8n-nodes-base.set',
              typeVersion: 3.4,
              position: [400, 0] as [number, number],
              parameters: {
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    {
                      id: 'assign-status',
                      name: 'status',
                      value: 'active',
                      type: 'string',
                    },
                  ],
                },
                // Keep fields from previous node
                includeOtherFields: true,
                options: {},
              },
            },
          ],
          connections: {
            'Manual Trigger': {
              main: [
                [{ node: 'Set Name', type: 'main' as const, index: 0 }],
              ],
            },
            'Set Name': {
              main: [
                [{ node: 'Set Status', type: 'main' as const, index: 0 }],
              ],
            },
          },
          active: false,
          settings: { executionOrder: 'v1' as const },
        },
        mode: 'manual',
      });

      // Verify execution completed successfully
      expect(result.finished).toBe(true);
      expect(result.status).toBe('success');

      // Verify all three nodes executed
      const runData = result.data.resultData.runData;
      expect(runData['Manual Trigger']).toBeDefined();
      expect(runData['Set Name']).toBeDefined();
      expect(runData['Set Status']).toBeDefined();

      // Verify Set Name output has "name" field
      const nameOutput = runData['Set Name']![0]!.data?.main?.[0];
      expect(nameOutput).toBeDefined();
      expect(nameOutput![0]!.json.name).toBe('test');

      // Verify Set Status output has both "name" and "status" fields
      // (includeOtherFields: true preserves fields from previous node)
      const statusOutput = runData['Set Status']![0]!.data?.main?.[0];
      expect(statusOutput).toBeDefined();
      expect(statusOutput![0]!.json.status).toBe('active');
      expect(statusOutput![0]!.json.name).toBe('test');
    }, 30000);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Expression evaluation
  // ---------------------------------------------------------------------------
  describe('expression evaluation', () => {
    it('should evaluate n8n expressions referencing previous node output', async () => {
      const result: IRun = await service.executeWorkflow({
        tenantId: 'e2e-expression-tenant',
        workflowJson: {
          id: 'e2e-expression-001',
          name: 'Expression Test',
          nodes: [
            {
              id: 'expr-trigger',
              name: 'Manual Trigger',
              type: 'n8n-nodes-base.manualTrigger',
              typeVersion: 1,
              position: [0, 0] as [number, number],
              parameters: {},
            },
            {
              id: 'expr-set-origin',
              name: 'Set Origin',
              type: 'n8n-nodes-base.set',
              typeVersion: 3.4,
              position: [200, 0] as [number, number],
              parameters: {
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    {
                      id: 'expr-a1',
                      name: 'name',
                      value: 'R360',
                      type: 'string',
                    },
                    {
                      id: 'expr-a2',
                      name: 'count',
                      value: '={{ 10 + 5 }}',
                      type: 'number',
                    },
                  ],
                },
                includeOtherFields: false,
                options: {},
              },
            },
            {
              id: 'expr-set-derived',
              name: 'Set Derived',
              type: 'n8n-nodes-base.set',
              typeVersion: 3.4,
              position: [400, 0] as [number, number],
              parameters: {
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    {
                      id: 'expr-a3',
                      name: 'message',
                      value: '={{ $json.name + " processed" }}',
                      type: 'string',
                    },
                    {
                      id: 'expr-a4',
                      name: 'doubled',
                      value: '={{ $json.count * 2 }}',
                      type: 'number',
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
                [{ node: 'Set Origin', type: 'main' as const, index: 0 }],
              ],
            },
            'Set Origin': {
              main: [
                [{ node: 'Set Derived', type: 'main' as const, index: 0 }],
              ],
            },
          },
          active: false,
          settings: { executionOrder: 'v1' as const },
        },
        mode: 'manual',
      });

      // Verify execution completed successfully
      expect(result.finished).toBe(true);
      expect(result.status).toBe('success');

      // Verify the origin node evaluated the arithmetic expression
      const originData = result.data.resultData.runData['Set Origin'];
      expect(originData).toBeDefined();
      const originOutput = originData![0]!.data?.main?.[0];
      expect(originOutput).toBeDefined();
      expect(originOutput![0]!.json.name).toBe('R360');
      expect(originOutput![0]!.json.count).toBe(15);

      // Verify the derived node evaluated expressions referencing $json from previous node
      const derivedData = result.data.resultData.runData['Set Derived'];
      expect(derivedData).toBeDefined();
      const derivedOutput = derivedData![0]!.data?.main?.[0];
      expect(derivedOutput).toBeDefined();

      // String concatenation expression: {{ $json.name + " processed" }}
      expect(derivedOutput![0]!.json.message).toBe('R360 processed');

      // Arithmetic expression referencing previous output: {{ $json.count * 2 }}
      expect(derivedOutput![0]!.json.doubled).toBe(30);
    }, 30000);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Lifecycle hooks
  // ---------------------------------------------------------------------------
  describe('lifecycle hooks', () => {
    it('should fire nodeExecuteBefore and nodeExecuteAfter for each node', async () => {
      const onHookEvent = vi.fn();

      const result: IRun = await service.executeWorkflow({
        tenantId: 'e2e-hooks-tenant',
        workflowJson: {
          id: 'e2e-hooks-001',
          name: 'Lifecycle Hooks Test',
          nodes: [
            {
              id: 'hooks-trigger',
              name: 'Manual Trigger',
              type: 'n8n-nodes-base.manualTrigger',
              typeVersion: 1,
              position: [0, 0] as [number, number],
              parameters: {},
            },
            {
              id: 'hooks-set-a',
              name: 'Set A',
              type: 'n8n-nodes-base.set',
              typeVersion: 3.4,
              position: [200, 0] as [number, number],
              parameters: {
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    {
                      id: 'hooks-a1',
                      name: 'value',
                      value: 'alpha',
                      type: 'string',
                    },
                  ],
                },
                includeOtherFields: false,
                options: {},
              },
            },
            {
              id: 'hooks-set-b',
              name: 'Set B',
              type: 'n8n-nodes-base.set',
              typeVersion: 3.4,
              position: [400, 0] as [number, number],
              parameters: {
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    {
                      id: 'hooks-a2',
                      name: 'value',
                      value: 'beta',
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
                [{ node: 'Set A', type: 'main' as const, index: 0 }],
              ],
            },
            'Set A': {
              main: [
                [{ node: 'Set B', type: 'main' as const, index: 0 }],
              ],
            },
          },
          active: false,
          settings: { executionOrder: 'v1' as const },
        },
        mode: 'manual',
        onHookEvent,
      });

      // Verify execution completed
      expect(result.finished).toBe(true);
      expect(result.status).toBe('success');

      // Verify the spy was called
      expect(onHookEvent).toHaveBeenCalled();

      // Extract all calls by event name
      const allCalls = onHookEvent.mock.calls;
      const eventNames = allCalls.map((call: unknown[]) => call[0] as string);

      // -- workflowExecuteBefore fires once at the start --
      const wfBeforeCalls = allCalls.filter(
        (call: unknown[]) => call[0] === 'workflowExecuteBefore',
      );
      expect(wfBeforeCalls.length).toBe(1);

      // -- workflowExecuteAfter fires once at the end --
      const wfAfterCalls = allCalls.filter(
        (call: unknown[]) => call[0] === 'workflowExecuteAfter',
      );
      expect(wfAfterCalls.length).toBe(1);

      // -- nodeExecuteBefore fires for each node (3 nodes: trigger + 2 set) --
      const nodeBeforeCalls = allCalls.filter(
        (call: unknown[]) => call[0] === 'nodeExecuteBefore',
      );
      expect(nodeBeforeCalls.length).toBeGreaterThanOrEqual(3);

      // Verify nodeExecuteBefore received node names in the data payload
      const nodeBeforeNames = nodeBeforeCalls.map(
        (call: unknown[]) => (call[1] as { nodeName: string }).nodeName,
      );
      expect(nodeBeforeNames).toContain('Manual Trigger');
      expect(nodeBeforeNames).toContain('Set A');
      expect(nodeBeforeNames).toContain('Set B');

      // -- nodeExecuteAfter fires for each node --
      const nodeAfterCalls = allCalls.filter(
        (call: unknown[]) => call[0] === 'nodeExecuteAfter',
      );
      expect(nodeAfterCalls.length).toBeGreaterThanOrEqual(3);

      // Verify nodeExecuteAfter received node names in the data payload
      const nodeAfterNames = nodeAfterCalls.map(
        (call: unknown[]) => (call[1] as { nodeName: string }).nodeName,
      );
      expect(nodeAfterNames).toContain('Manual Trigger');
      expect(nodeAfterNames).toContain('Set A');
      expect(nodeAfterNames).toContain('Set B');

      // -- Verify ordering: workflowBefore is first, workflowAfter is last --
      const firstEvent = eventNames[0];
      const lastEvent = eventNames[eventNames.length - 1];
      expect(firstEvent).toBe('workflowExecuteBefore');
      expect(lastEvent).toBe('workflowExecuteAfter');

      // -- All nodeExecuteBefore/After events are between workflow start and end --
      const wfBeforeIndex = eventNames.indexOf('workflowExecuteBefore');
      const wfAfterIndex = eventNames.lastIndexOf('workflowExecuteAfter');

      for (let i = 0; i < eventNames.length; i++) {
        if (
          eventNames[i] === 'nodeExecuteBefore' ||
          eventNames[i] === 'nodeExecuteAfter'
        ) {
          expect(i).toBeGreaterThan(wfBeforeIndex);
          expect(i).toBeLessThan(wfAfterIndex);
        }
      }

      // -- Verify nodeExecuteAfter includes taskData --
      for (const call of nodeAfterCalls) {
        const data = call[1] as { nodeName: string; taskData: unknown };
        expect(data.taskData).toBeDefined();
      }
    }, 30000);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Tenant isolation
  // ---------------------------------------------------------------------------
  describe('tenant isolation', () => {
    it('should isolate execution state between different tenantIds', async () => {
      // Create two distinct workflows with tenant-specific values
      const workflowForTenantA = createSimpleWorkflow(
        'Tenant A Workflow',
        'data-from-tenant-A',
      );
      const workflowForTenantB = createSimpleWorkflow(
        'Tenant B Workflow',
        'data-from-tenant-B',
      );

      const hooksA = vi.fn();
      const hooksB = vi.fn();

      // Execute both concurrently with different tenantIds
      const [resultA, resultB] = await Promise.all([
        service.executeWorkflow({
          tenantId: 'tenant-alpha',
          workflowJson: { ...workflowForTenantA, id: 'iso-wf-alpha' },
          mode: 'manual',
          onHookEvent: hooksA,
        }),
        service.executeWorkflow({
          tenantId: 'tenant-beta',
          workflowJson: { ...workflowForTenantB, id: 'iso-wf-beta' },
          mode: 'manual',
          onHookEvent: hooksB,
        }),
      ]);

      // Both executions should succeed independently
      expect(resultA.finished).toBe(true);
      expect(resultA.status).toBe('success');
      expect(resultB.finished).toBe(true);
      expect(resultB.status).toBe('success');

      // Verify output data is tenant-specific -- no cross-contamination
      const outputA =
        resultA.data.resultData.runData['Set']![0]!.data?.main?.[0];
      const outputB =
        resultB.data.resultData.runData['Set']![0]!.data?.main?.[0];

      expect(outputA).toBeDefined();
      expect(outputB).toBeDefined();
      expect(outputA![0]!.json.result).toBe('data-from-tenant-A');
      expect(outputB![0]!.json.result).toBe('data-from-tenant-B');

      // Verify each execution received its own lifecycle hooks (no cross-talk)
      expect(hooksA).toHaveBeenCalled();
      expect(hooksB).toHaveBeenCalled();

      // Tenant A hooks should reference tenant A's workflow events
      const hooksACalls = hooksA.mock.calls.map(
        (call: unknown[]) => call[0] as string,
      );
      expect(hooksACalls).toContain('workflowExecuteBefore');
      expect(hooksACalls).toContain('workflowExecuteAfter');

      // Tenant B hooks should reference tenant B's workflow events
      const hooksBCalls = hooksB.mock.calls.map(
        (call: unknown[]) => call[0] as string,
      );
      expect(hooksBCalls).toContain('workflowExecuteBefore');
      expect(hooksBCalls).toContain('workflowExecuteAfter');

      // The hook spies should be completely separate -- tenant A's spy
      // should NOT have been called by tenant B's execution and vice versa.
      // We verify this by checking that the call counts are reasonable
      // (each execution has its own small set of events, not doubled).
      const hooksANodeBefore = hooksA.mock.calls.filter(
        (call: unknown[]) => call[0] === 'nodeExecuteBefore',
      );
      const hooksBNodeBefore = hooksB.mock.calls.filter(
        (call: unknown[]) => call[0] === 'nodeExecuteBefore',
      );

      // Each workflow has 2 nodes (Trigger + Set), so 2 nodeExecuteBefore per tenant
      expect(hooksANodeBefore.length).toBe(2);
      expect(hooksBNodeBefore.length).toBe(2);
    }, 30000);

    it('should not share state across sequential executions for different tenants', async () => {
      // Execute for tenant 1 first
      const result1 = await service.executeWorkflow({
        tenantId: 'sequential-tenant-1',
        workflowJson: {
          ...createSimpleWorkflow('Sequential 1', 'seq-value-1'),
          id: 'seq-wf-1',
        },
        mode: 'manual',
      });

      // Execute for tenant 2 second
      const result2 = await service.executeWorkflow({
        tenantId: 'sequential-tenant-2',
        workflowJson: {
          ...createSimpleWorkflow('Sequential 2', 'seq-value-2'),
          id: 'seq-wf-2',
        },
        mode: 'manual',
      });

      // Each should have succeeded independently
      expect(result1.finished).toBe(true);
      expect(result2.finished).toBe(true);

      // Verify data integrity -- no bleed from previous execution
      const output1 =
        result1.data.resultData.runData['Set']![0]!.data?.main?.[0];
      const output2 =
        result2.data.resultData.runData['Set']![0]!.data?.main?.[0];

      expect(output1![0]!.json.result).toBe('seq-value-1');
      expect(output2![0]!.json.result).toBe('seq-value-2');
    }, 30000);
  });
});

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Create a minimal two-node workflow (ManualTrigger -> Set) for reuse in tests.
 * The Set node uses includeOtherFields: false so it produces a clean output
 * with just the "result" field.
 */
function createSimpleWorkflow(
  name: string,
  value: string,
): {
  name: string;
  nodes: INode[];
  connections: IConnections;
  active: boolean;
  settings: { executionOrder: 'v1' };
} {
  return {
    name,
    active: false,
    nodes: [
      {
        id: 't1',
        name: 'Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [0, 0] as [number, number],
        parameters: {} as INodeParameters,
      },
      {
        id: 's1',
        name: 'Set',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [200, 0] as [number, number],
        parameters: {
          mode: 'manual',
          duplicateItem: false,
          assignments: {
            assignments: [
              { id: '1', name: 'result', value, type: 'string' },
            ],
          },
          includeOtherFields: false,
          options: {},
        } as INodeParameters,
      },
    ],
    connections: {
      Trigger: {
        main: [[{ node: 'Set', type: 'main' as const, index: 0 }]],
      },
    },
    settings: { executionOrder: 'v1' as const },
  };
}
