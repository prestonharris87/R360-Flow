import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IRun } from 'n8n-workflow';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bootstrapN8nContainer, resetBootstrap } from '../bootstrap.js';
import { R360NodeTypes } from '../node-types.js';
import { ExecutionService } from '../execution-service.js';
import { translateWBToN8n } from '@r360/json-translator';
import type { DiagramModel, WorkflowParameters } from '@r360/json-translator';

const TEST_ENCRYPTION_KEY = 'test-e2e-encryption-key-min-32-chars!!';
const TEST_MASTER_KEY = 'master-key-for-e2e-testing-purposes!';

/**
 * End-to-end integration tests for the full workflow execution pipeline.
 *
 * These tests exercise the complete path from workflow definition through
 * n8n execution and result capture, verifying:
 * - Multi-node chain execution
 * - DiagramModel -> n8n translation -> execution round-trip
 * - Expression evaluation in workflows
 * - Concurrent tenant isolation
 * - Lifecycle hook firing and ordering
 * - Output data correctness
 */
describe('E2E Workflow Execution', { timeout: 120000 }, () => {
  let testUserFolder: string;
  let nodeTypes: R360NodeTypes;
  let service: ExecutionService;

  beforeAll(async () => {
    testUserFolder = mkdtempSync(path.join(tmpdir(), 'r360-e2e-'));

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
    resetBootstrap();
    try {
      rmSync(testUserFolder, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  // ---------------------------------------------------------------------------
  // Test 1: Multi-node chain execution
  // ---------------------------------------------------------------------------
  it('should execute ManualTrigger -> Set -> Set chain', async () => {
    const hookEvents: string[] = [];

    const result: IRun = await service.executeWorkflow({
      tenantId: 'e2e-tenant-chain',
      workflowJson: {
        id: 'e2e-chain-001',
        name: 'E2E Chain Test',
        nodes: [
          {
            id: 'trigger-1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
          {
            id: 'set-1',
            name: 'Set First',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [200, 0] as [number, number],
            parameters: {
              mode: 'manual',
              duplicateItem: false,
              assignments: {
                assignments: [
                  { id: '1', name: 'step', value: 'first', type: 'string' },
                ],
              },
              includeOtherFields: false,
              options: {},
            },
          },
          {
            id: 'set-2',
            name: 'Set Second',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [400, 0] as [number, number],
            parameters: {
              mode: 'manual',
              duplicateItem: false,
              assignments: {
                assignments: [
                  { id: '2', name: 'step', value: 'second', type: 'string' },
                ],
              },
              includeOtherFields: false,
              options: {},
            },
          },
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Set First', type: 'main' as const, index: 0 }]],
          },
          'Set First': {
            main: [[{ node: 'Set Second', type: 'main' as const, index: 0 }]],
          },
        },
        active: false,
        settings: { executionOrder: 'v1' as const },
      },
      mode: 'manual',
      onHookEvent: (event: string) => {
        hookEvents.push(event);
      },
    });

    // Verify overall execution succeeded
    expect(result).toBeDefined();
    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');

    // Verify all three nodes executed
    const runData = result.data.resultData.runData;
    expect(runData['Manual Trigger']).toBeDefined();
    expect(runData['Set First']).toBeDefined();
    expect(runData['Set Second']).toBeDefined();

    // Verify Set First output
    const firstOutput = runData['Set First'][0].data?.main?.[0];
    expect(firstOutput).toBeDefined();
    expect(firstOutput!.length).toBeGreaterThan(0);
    expect(firstOutput![0].json.step).toBe('first');

    // Verify Set Second output (final node in chain)
    const secondOutput = runData['Set Second'][0].data?.main?.[0];
    expect(secondOutput).toBeDefined();
    expect(secondOutput!.length).toBeGreaterThan(0);
    expect(secondOutput![0].json.step).toBe('second');

    // Verify lifecycle hooks fired
    expect(hookEvents).toContain('workflowExecuteBefore');
    expect(hookEvents).toContain('workflowExecuteAfter');
    expect(hookEvents).toContain('nodeExecuteBefore');
    expect(hookEvents).toContain('nodeExecuteAfter');
  }, 30000);

  // ---------------------------------------------------------------------------
  // Test 2: DiagramModel translation -> execution round-trip
  // ---------------------------------------------------------------------------
  it('should execute workflow translated from DiagramModel format', async () => {
    // Create a DiagramModel as the Workflow Builder would produce
    const diagram: DiagramModel = {
      name: 'Translated Workflow',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'n1',
            type: 'start-node',
            position: { x: 0, y: 0 },
            data: {
              type: 'n8n-nodes-base.manualTrigger',
              icon: 'play',
              properties: {
                label: 'Start',
              },
            },
          },
          {
            id: 'n2',
            type: 'node',
            position: { x: 200, y: 0 },
            data: {
              type: 'n8n-nodes-base.set',
              icon: 'edit',
              properties: {
                label: 'Set Data',
                typeVersion: 3.4,
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    {
                      id: '1',
                      name: 'source',
                      value: 'translated',
                      type: 'string',
                    },
                  ],
                },
                includeOtherFields: false,
                options: {},
              },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2' },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    // Translate DiagramModel to n8n WorkflowParameters
    const translated = translateWBToN8n(diagram);

    // Verify translation produced valid structure
    expect(translated.name).toBe('Translated Workflow');
    expect(translated.nodes).toHaveLength(2);
    expect(translated.connections).toBeDefined();

    // Execute the translated workflow via the execution service
    // Map from WorkflowParameters to ExecuteWorkflowParams
    const result: IRun = await service.executeWorkflow({
      tenantId: 'e2e-tenant-translated',
      workflowJson: {
        id: 'e2e-translated-001',
        name: translated.name,
        nodes: translated.nodes as any, // WorkflowParameters INode -> n8n-workflow INode
        connections: translated.connections as any,
        active: translated.active,
        settings: translated.settings as any,
      },
      mode: 'manual',
    });

    expect(result).toBeDefined();
    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');

    // Verify the Set node output contains data from the translated workflow
    const setNodeData = result.data.resultData.runData['Set Data'];
    expect(setNodeData).toBeDefined();
    expect(setNodeData.length).toBeGreaterThan(0);

    const outputItems = setNodeData[0].data?.main?.[0];
    expect(outputItems).toBeDefined();
    expect(outputItems!.length).toBeGreaterThan(0);
    expect(outputItems![0].json.source).toBe('translated');
  }, 30000);

  // ---------------------------------------------------------------------------
  // Test 3: Expression evaluation
  // ---------------------------------------------------------------------------
  it('should handle expression evaluation across nodes', async () => {
    const result: IRun = await service.executeWorkflow({
      tenantId: 'e2e-tenant-expression',
      workflowJson: {
        id: 'e2e-expression-001',
        name: 'Expression Test',
        nodes: [
          {
            id: 'trigger-expr',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
          {
            id: 'set-origin',
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
                    id: 'a1',
                    name: 'greeting',
                    value: 'Hello',
                    type: 'string',
                  },
                  {
                    id: 'a2',
                    name: 'count',
                    value: '={{ 21 + 21 }}',
                    type: 'number',
                  },
                ],
              },
              includeOtherFields: false,
              options: {},
            },
          },
          {
            id: 'set-derived',
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
                    id: 'a3',
                    name: 'message',
                    value: '={{ $json.greeting }} World',
                    type: 'string',
                  },
                  {
                    id: 'a4',
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
            main: [[{ node: 'Set Origin', type: 'main' as const, index: 0 }]],
          },
          'Set Origin': {
            main: [[{ node: 'Set Derived', type: 'main' as const, index: 0 }]],
          },
        },
        active: false,
        settings: { executionOrder: 'v1' as const },
      },
      mode: 'manual',
    });

    expect(result).toBeDefined();
    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');

    // Verify expression in Set Origin evaluated the math expression
    const originData = result.data.resultData.runData['Set Origin'];
    expect(originData).toBeDefined();
    const originOutput = originData[0].data?.main?.[0];
    expect(originOutput).toBeDefined();
    expect(originOutput![0].json.greeting).toBe('Hello');
    expect(originOutput![0].json.count).toBe(42);

    // Verify expression in Set Derived referenced previous node output
    const derivedData = result.data.resultData.runData['Set Derived'];
    expect(derivedData).toBeDefined();
    const derivedOutput = derivedData[0].data?.main?.[0];
    expect(derivedOutput).toBeDefined();
    expect(derivedOutput![0].json.message).toBe('Hello World');
    expect(derivedOutput![0].json.doubled).toBe(84);
  }, 30000);

  // ---------------------------------------------------------------------------
  // Test 4: Concurrent tenant isolation
  // ---------------------------------------------------------------------------
  it('should isolate concurrent tenant executions', async () => {
    const workflow1 = createSimpleWorkflow('Tenant1 WF', 'value-for-tenant-1');
    const workflow2 = createSimpleWorkflow('Tenant2 WF', 'value-for-tenant-2');

    const hooks1: string[] = [];
    const hooks2: string[] = [];

    const [result1, result2] = await Promise.all([
      service.executeWorkflow({
        tenantId: 'isolation-tenant-1',
        workflowJson: { ...workflow1, id: 'iso-wf-1' },
        mode: 'manual',
        onHookEvent: (event: string) => hooks1.push(event),
      }),
      service.executeWorkflow({
        tenantId: 'isolation-tenant-2',
        workflowJson: { ...workflow2, id: 'iso-wf-2' },
        mode: 'manual',
        onHookEvent: (event: string) => hooks2.push(event),
      }),
    ]);

    // Both should succeed independently
    expect(result1.finished).toBe(true);
    expect(result1.status).toBe('success');
    expect(result2.finished).toBe(true);
    expect(result2.status).toBe('success');

    // Verify output data is tenant-specific (not cross-contaminated)
    const output1 = result1.data.resultData.runData['Set'][0].data?.main?.[0];
    const output2 = result2.data.resultData.runData['Set'][0].data?.main?.[0];

    expect(output1).toBeDefined();
    expect(output2).toBeDefined();
    expect(output1![0].json.result).toBe('value-for-tenant-1');
    expect(output2![0].json.result).toBe('value-for-tenant-2');

    // Verify both executions received their own lifecycle hooks
    expect(hooks1).toContain('workflowExecuteBefore');
    expect(hooks1).toContain('workflowExecuteAfter');
    expect(hooks2).toContain('workflowExecuteBefore');
    expect(hooks2).toContain('workflowExecuteAfter');
  }, 30000);

  // ---------------------------------------------------------------------------
  // Test 5: Lifecycle hook completeness and ordering
  // ---------------------------------------------------------------------------
  it('should fire all lifecycle hooks in correct order for multi-node workflow', async () => {
    const hookEvents: Array<{ event: string; data?: unknown }> = [];

    await service.executeWorkflow({
      tenantId: 'e2e-tenant-hooks',
      workflowJson: {
        id: 'e2e-hooks-001',
        name: 'Hook Order Test',
        nodes: [
          {
            id: 'h-trigger',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
          {
            id: 'h-set-1',
            name: 'Set A',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [200, 0] as [number, number],
            parameters: {
              mode: 'manual',
              duplicateItem: false,
              assignments: {
                assignments: [
                  { id: 'ha1', name: 'val', value: 'a', type: 'string' },
                ],
              },
              includeOtherFields: false,
              options: {},
            },
          },
          {
            id: 'h-set-2',
            name: 'Set B',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [400, 0] as [number, number],
            parameters: {
              mode: 'manual',
              duplicateItem: false,
              assignments: {
                assignments: [
                  { id: 'ha2', name: 'val', value: 'b', type: 'string' },
                ],
              },
              includeOtherFields: false,
              options: {},
            },
          },
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Set A', type: 'main' as const, index: 0 }]],
          },
          'Set A': {
            main: [[{ node: 'Set B', type: 'main' as const, index: 0 }]],
          },
        },
        active: false,
        settings: { executionOrder: 'v1' as const },
      },
      mode: 'manual',
      onHookEvent: (event: string, data?: unknown) => {
        hookEvents.push({ event, data });
      },
    });

    const eventNames = hookEvents.map((h) => h.event);

    // workflowExecuteBefore must be first
    const wfBefore = eventNames.indexOf('workflowExecuteBefore');
    expect(wfBefore).toBe(0);

    // workflowExecuteAfter must be last
    const wfAfter = eventNames.indexOf('workflowExecuteAfter');
    expect(wfAfter).toBe(eventNames.length - 1);

    // All nodeExecuteBefore/After events must be between workflow start and end
    const nodeBeforeIndices = eventNames
      .map((e, i) => (e === 'nodeExecuteBefore' ? i : -1))
      .filter((i) => i >= 0);
    const nodeAfterIndices = eventNames
      .map((e, i) => (e === 'nodeExecuteAfter' ? i : -1))
      .filter((i) => i >= 0);

    // Should have nodeExecuteBefore/After for each node (trigger + 2 set nodes = 3)
    expect(nodeBeforeIndices.length).toBeGreaterThanOrEqual(3);
    expect(nodeAfterIndices.length).toBeGreaterThanOrEqual(3);

    // All node events must be between workflow events
    for (const idx of [...nodeBeforeIndices, ...nodeAfterIndices]) {
      expect(idx).toBeGreaterThan(wfBefore);
      expect(idx).toBeLessThan(wfAfter);
    }
  }, 30000);

  // ---------------------------------------------------------------------------
  // Test 6: Workflow with no data nodes (trigger only)
  // ---------------------------------------------------------------------------
  it('should execute a trigger-only workflow successfully', async () => {
    const result: IRun = await service.executeWorkflow({
      tenantId: 'e2e-tenant-trigger-only',
      workflowJson: {
        id: 'e2e-trigger-only-001',
        name: 'Trigger Only',
        nodes: [
          {
            id: 'solo-trigger',
            name: 'Manual Trigger',
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

    expect(result).toBeDefined();
    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');
    expect(result.data.resultData.runData['Manual Trigger']).toBeDefined();
  }, 30000);

  // ---------------------------------------------------------------------------
  // Test 7: Multiple concurrent executions for the same tenant
  // ---------------------------------------------------------------------------
  it('should handle multiple concurrent executions for the same tenant', async () => {
    const workflows = Array.from({ length: 5 }, (_, i) =>
      createSimpleWorkflow(`Concurrent WF ${i}`, `concurrent-value-${i}`),
    );

    const results = await Promise.all(
      workflows.map((wf, i) =>
        service.executeWorkflow({
          tenantId: 'e2e-tenant-concurrent',
          workflowJson: { ...wf, id: `e2e-concurrent-${i}` },
          mode: 'manual',
        }),
      ),
    );

    // All five executions should succeed
    for (let i = 0; i < results.length; i++) {
      expect(results[i].finished).toBe(true);
      expect(results[i].status).toBe('success');

      const output = results[i].data.resultData.runData['Set'][0].data?.main?.[0];
      expect(output).toBeDefined();
      expect(output![0].json.result).toBe(`concurrent-value-${i}`);
    }
  }, 60000);

  // ---------------------------------------------------------------------------
  // Test 8: Longer chain to verify data flows through pipeline
  // ---------------------------------------------------------------------------
  it('should propagate data through a 5-node chain', async () => {
    const result: IRun = await service.executeWorkflow({
      tenantId: 'e2e-tenant-long-chain',
      workflowJson: {
        id: 'e2e-long-chain-001',
        name: 'Long Chain Test',
        nodes: [
          {
            id: 'lc-trigger',
            name: 'Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
          ...Array.from({ length: 4 }, (_, i) => ({
            id: `lc-set-${i}`,
            name: `Step ${i + 1}`,
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [(i + 1) * 200, 0] as [number, number],
            parameters: {
              mode: 'manual',
              duplicateItem: false,
              assignments: {
                assignments: [
                  {
                    id: `lc-a-${i}`,
                    name: `field_${i + 1}`,
                    value: `value_${i + 1}`,
                    type: 'string',
                  },
                ],
              },
              includeOtherFields: true,
              options: {},
            },
          })),
        ],
        connections: {
          Trigger: {
            main: [[{ node: 'Step 1', type: 'main' as const, index: 0 }]],
          },
          'Step 1': {
            main: [[{ node: 'Step 2', type: 'main' as const, index: 0 }]],
          },
          'Step 2': {
            main: [[{ node: 'Step 3', type: 'main' as const, index: 0 }]],
          },
          'Step 3': {
            main: [[{ node: 'Step 4', type: 'main' as const, index: 0 }]],
          },
        },
        active: false,
        settings: { executionOrder: 'v1' as const },
      },
      mode: 'manual',
    });

    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');

    // Verify each step executed
    for (let i = 1; i <= 4; i++) {
      const stepData = result.data.resultData.runData[`Step ${i}`];
      expect(stepData).toBeDefined();
      expect(stepData.length).toBeGreaterThan(0);
    }

    // Verify the final step accumulated all fields (includeOtherFields: true)
    const finalOutput = result.data.resultData.runData['Step 4'][0].data?.main?.[0];
    expect(finalOutput).toBeDefined();
    expect(finalOutput![0].json.field_4).toBe('value_4');
    // With includeOtherFields: true, earlier fields should be preserved
    expect(finalOutput![0].json.field_3).toBe('value_3');
    expect(finalOutput![0].json.field_2).toBe('value_2');
    expect(finalOutput![0].json.field_1).toBe('value_1');
  }, 30000);

  // ---------------------------------------------------------------------------
  // Test 9: DiagramModel with multiple nodes and edges
  // ---------------------------------------------------------------------------
  it('should translate and execute a complex DiagramModel', async () => {
    const diagram: DiagramModel = {
      name: 'Complex Diagram',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'cd-n1',
            type: 'start-node',
            position: { x: 0, y: 0 },
            data: {
              type: 'n8n-nodes-base.manualTrigger',
              icon: 'play',
              properties: { label: 'Start' },
            },
          },
          {
            id: 'cd-n2',
            type: 'node',
            position: { x: 200, y: 0 },
            data: {
              type: 'n8n-nodes-base.set',
              icon: 'edit',
              properties: {
                label: 'First Edit',
                typeVersion: 3.4,
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    { id: 'cd-a1', name: 'stage', value: 'first', type: 'string' },
                  ],
                },
                includeOtherFields: false,
                options: {},
              },
            },
          },
          {
            id: 'cd-n3',
            type: 'node',
            position: { x: 400, y: 0 },
            data: {
              type: 'n8n-nodes-base.set',
              icon: 'edit',
              properties: {
                label: 'Second Edit',
                typeVersion: 3.4,
                mode: 'manual',
                duplicateItem: false,
                assignments: {
                  assignments: [
                    { id: 'cd-a2', name: 'stage', value: 'second', type: 'string' },
                    { id: 'cd-a3', name: 'complete', value: 'true', type: 'string' },
                  ],
                },
                includeOtherFields: false,
                options: {},
              },
            },
          },
        ],
        edges: [
          { id: 'cd-e1', source: 'cd-n1', target: 'cd-n2' },
          { id: 'cd-e2', source: 'cd-n2', target: 'cd-n3' },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const translated = translateWBToN8n(diagram);

    // Verify translation
    expect(translated.nodes).toHaveLength(3);
    expect(Object.keys(translated.connections)).toHaveLength(2);

    const result: IRun = await service.executeWorkflow({
      tenantId: 'e2e-tenant-complex-diagram',
      workflowJson: {
        id: 'e2e-complex-diagram-001',
        name: translated.name,
        nodes: translated.nodes as any,
        connections: translated.connections as any,
        active: translated.active,
        settings: translated.settings as any,
      },
      mode: 'manual',
    });

    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');

    // Verify final node output
    const secondEditData = result.data.resultData.runData['Second Edit'];
    expect(secondEditData).toBeDefined();
    const output = secondEditData[0].data?.main?.[0];
    expect(output).toBeDefined();
    expect(output![0].json.stage).toBe('second');
    expect(output![0].json.complete).toBe('true');
  }, 30000);

  // ---------------------------------------------------------------------------
  // Test 10: Verify execution result structure
  // ---------------------------------------------------------------------------
  it('should return a well-formed IRun with all expected fields', async () => {
    const result: IRun = await service.executeWorkflow({
      tenantId: 'e2e-tenant-structure',
      workflowJson: createSimpleWorkflow('Structure Test', 'check'),
      mode: 'manual',
    });

    // Top-level IRun fields
    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');
    expect(result.data).toBeDefined();
    expect(result.data.resultData).toBeDefined();
    expect(result.data.resultData.runData).toBeDefined();
    expect(result.data.resultData.error).toBeUndefined();

    // Execution timing
    expect(result.startedAt).toBeDefined();
    expect(result.startedAt).toBeInstanceOf(Date);

    // Run data should have entries for each executed node
    const runData = result.data.resultData.runData;
    expect(Object.keys(runData).length).toBeGreaterThan(0);

    // Each node result should have task data
    for (const nodeName of Object.keys(runData)) {
      const nodeResult = runData[nodeName];
      expect(nodeResult).toBeDefined();
      expect(nodeResult.length).toBeGreaterThan(0);
      expect(nodeResult[0].executionStatus).toBeDefined();
    }
  }, 30000);
});

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Create a minimal two-node workflow (ManualTrigger -> Set) for reuse in tests.
 */
function createSimpleWorkflow(
  name: string,
  value: string,
): {
  name: string;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    typeVersion: number;
    position: [number, number];
    parameters: Record<string, unknown>;
  }>;
  connections: Record<string, unknown>;
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
        position: [0, 0],
        parameters: {},
      },
      {
        id: 's1',
        name: 'Set',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [200, 0],
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
        },
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
