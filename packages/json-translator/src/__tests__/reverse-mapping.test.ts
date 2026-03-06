import { describe, it, expect } from 'vitest';
import {
  mapN8nToWBNode,
  mapConnectionsToEdges,
  resolveWBNodeType,
  resolveIcon,
  TRIGGER_TYPES,
} from '../reverse-mapping';
import type { INode, IConnections } from '../types';
import type { WorkflowBuilderEdge } from '../wb-types';

// ---------------------------------------------------------------------------
// resolveWBNodeType
// ---------------------------------------------------------------------------

describe('resolveWBNodeType', () => {
  it('returns "start-node" for known trigger types in TRIGGER_TYPES set', () => {
    for (const triggerType of TRIGGER_TYPES) {
      expect(resolveWBNodeType(triggerType)).toBe('start-node');
    }
  });

  it('returns "start-node" for unknown types that contain "trigger" (heuristic)', () => {
    expect(resolveWBNodeType('n8n-nodes-base.somethingTrigger')).toBe('start-node');
    expect(resolveWBNodeType('n8n-nodes-base.customtrigger')).toBe('start-node');
  });

  it('returns "decision-node" for if node', () => {
    expect(resolveWBNodeType('n8n-nodes-base.if')).toBe('decision-node');
  });

  it('returns "decision-node" for switch node', () => {
    expect(resolveWBNodeType('n8n-nodes-base.switch')).toBe('decision-node');
  });

  it('returns "node" for regular/unknown types', () => {
    expect(resolveWBNodeType('n8n-nodes-base.set')).toBe('node');
    expect(resolveWBNodeType('n8n-nodes-base.httpRequest')).toBe('node');
    expect(resolveWBNodeType('n8n-nodes-base.code')).toBe('node');
    expect(resolveWBNodeType('n8n-nodes-base.merge')).toBe('node');
    expect(resolveWBNodeType('n8n-nodes-base.unknownNode')).toBe('node');
  });
});

// ---------------------------------------------------------------------------
// resolveIcon
// ---------------------------------------------------------------------------

describe('resolveIcon', () => {
  it('resolves icon from NODE_TYPE_ICONS for known types', () => {
    expect(resolveIcon('n8n-nodes-base.manualTrigger')).toBe('PlayCircle');
    expect(resolveIcon('n8n-nodes-base.httpRequest')).toBe('Globe');
    expect(resolveIcon('n8n-nodes-base.if')).toBe('GitBranch');
    expect(resolveIcon('n8n-nodes-base.code')).toBe('Code');
    expect(resolveIcon('n8n-nodes-base.slack')).toBe('MessageSquare');
  });

  it('returns fallback "Box" for unknown types', () => {
    expect(resolveIcon('n8n-nodes-base.unknownNode')).toBe('Box');
    expect(resolveIcon('some-community-package.customNode')).toBe('Box');
  });
});

// ---------------------------------------------------------------------------
// mapN8nToWBNode
// ---------------------------------------------------------------------------

describe('mapN8nToWBNode', () => {
  it('converts an n8n INode to a WorkflowBuilderNode (trigger -> start-node)', () => {
    const n8nNode: INode = {
      id: 'abc-123',
      name: 'When clicking "Test workflow"',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 100],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);

    expect(wbNode.id).toBe('abc-123');
    expect(wbNode.position).toEqual({ x: 250, y: 100 });
    expect(wbNode.data.type).toBe('n8n-nodes-base.manualTrigger');
    expect(wbNode.data.properties.label).toBe('When clicking "Test workflow"');
    expect(wbNode.type).toBe('start-node');
  });

  it('converts a decision node (if) to decision-node type', () => {
    const n8nNode: INode = {
      id: 'if-1',
      name: 'Check Condition',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [400, 200],
      parameters: {
        conditions: {
          string: [{ value1: '={{ $json.status }}', operation: 'equals', value2: 'active' }],
        },
      },
    };

    const wbNode = mapN8nToWBNode(n8nNode);

    expect(wbNode.type).toBe('decision-node');
    expect(wbNode.data.icon).toBe('GitBranch');
    expect(wbNode.data.properties.label).toBe('Check Condition');
    expect(wbNode.data.properties.conditions).toEqual({
      string: [{ value1: '={{ $json.status }}', operation: 'equals', value2: 'active' }],
    });
  });

  it('converts a switch node to decision-node type', () => {
    const n8nNode: INode = {
      id: 'switch-1',
      name: 'Route',
      type: 'n8n-nodes-base.switch',
      typeVersion: 1,
      position: [300, 150],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.type).toBe('decision-node');
  });

  it('converts a regular node with parameters', () => {
    const n8nNode: INode = {
      id: 'def-456',
      name: 'Set Values',
      type: 'n8n-nodes-base.set',
      typeVersion: 3,
      position: [500, 100],
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            { name: 'key', value: 'val', type: 'string' },
          ],
        },
      },
    };

    const wbNode = mapN8nToWBNode(n8nNode);

    expect(wbNode.data.properties.label).toBe('Set Values');
    expect(wbNode.data.properties.typeVersion).toBe(3);
    expect(wbNode.data.properties.mode).toBe('manual');
    expect(wbNode.data.properties.assignments).toEqual({
      assignments: [{ name: 'key', value: 'val', type: 'string' }],
    });
    expect(wbNode.type).toBe('node');
  });

  it('converts position [x, y] tuple to { x, y } object', () => {
    const n8nNode: INode = {
      id: 'pos-test',
      name: 'Position Test',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [123, 456],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.position).toEqual({ x: 123, y: 456 });
  });

  it('resolves icon from NODE_TYPE_ICONS', () => {
    const n8nNode: INode = {
      id: 'icon-test',
      name: 'HTTP Node',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.icon).toBe('Globe');
  });

  it('uses fallback icon "Box" for unknown type', () => {
    const n8nNode: INode = {
      id: 'unknown-icon',
      name: 'Custom Node',
      type: 'some-community-package.myNode',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.icon).toBe('Box');
  });

  it('carries typeVersion to properties when != 1', () => {
    const n8nNode: INode = {
      id: 'v3-node',
      name: 'Edit Fields v3',
      type: 'n8n-nodes-base.set',
      typeVersion: 3,
      position: [0, 0],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.typeVersion).toBe(3);
  });

  it('does NOT include typeVersion in properties when == 1', () => {
    const n8nNode: INode = {
      id: 'v1-node',
      name: 'Edit Fields v1',
      type: 'n8n-nodes-base.set',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties).not.toHaveProperty('typeVersion');
  });

  it('carries disabled to properties', () => {
    const n8nNode: INode = {
      id: 'disabled-node',
      name: 'Disabled',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      disabled: true,
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.disabled).toBe(true);
  });

  it('carries continueOnFail to properties', () => {
    const n8nNode: INode = {
      id: 'cof-node',
      name: 'Continue',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      continueOnFail: true,
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.continueOnFail).toBe(true);
  });

  it('carries onError to properties', () => {
    const n8nNode: INode = {
      id: 'onerror-node',
      name: 'Error Handler',
      type: 'n8n-nodes-base.code',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      onError: 'continueErrorOutput',
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.onError).toBe('continueErrorOutput');
  });

  it('carries credentials as properties', () => {
    const n8nNode: INode = {
      id: 'creds-node',
      name: 'Slack Post',
      type: 'n8n-nodes-base.slack',
      typeVersion: 1,
      position: [0, 0],
      parameters: { channel: '#general' },
      credentials: {
        slackApi: { id: 'cred-123', name: 'My Slack Account' },
      },
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.credentials).toEqual({
      slackApi: { id: 'cred-123', name: 'My Slack Account' },
    });
    // Parameters should still be present
    expect(wbNode.data.properties.channel).toBe('#general');
  });

  it('carries retryOnFail, maxTries, waitBetweenTries to properties', () => {
    const n8nNode: INode = {
      id: 'retry-node',
      name: 'Retry Node',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000,
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.retryOnFail).toBe(true);
    expect(wbNode.data.properties.maxTries).toBe(3);
    expect(wbNode.data.properties.waitBetweenTries).toBe(1000);
  });

  it('carries notesInFlow to properties', () => {
    const n8nNode: INode = {
      id: 'notes-node',
      name: 'Notes Node',
      type: 'n8n-nodes-base.code',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      notes: 'Important step',
      notesInFlow: true,
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.description).toBe('Important step');
    expect(wbNode.data.properties.notesInFlow).toBe(true);
  });

  it('does not set optional meta fields when not present on INode', () => {
    const n8nNode: INode = {
      id: 'minimal',
      name: 'Minimal',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties).not.toHaveProperty('typeVersion');
    expect(wbNode.data.properties).not.toHaveProperty('disabled');
    expect(wbNode.data.properties).not.toHaveProperty('continueOnFail');
    expect(wbNode.data.properties).not.toHaveProperty('onError');
    expect(wbNode.data.properties).not.toHaveProperty('credentials');
    expect(wbNode.data.properties).not.toHaveProperty('retryOnFail');
    expect(wbNode.data.properties).not.toHaveProperty('maxTries');
    expect(wbNode.data.properties).not.toHaveProperty('waitBetweenTries');
    expect(wbNode.data.properties).not.toHaveProperty('notesInFlow');
  });

  it('maps node name to properties.label', () => {
    const n8nNode: INode = {
      id: 'label-test',
      name: 'My Custom Label',
      type: 'n8n-nodes-base.set',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.label).toBe('My Custom Label');
  });

  it('maps node notes to properties.description', () => {
    const n8nNode: INode = {
      id: 'notes-desc',
      name: 'Noted Node',
      type: 'n8n-nodes-base.code',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      notes: 'This processes data',
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.description).toBe('This processes data');
  });

  it('preserves all n8n parameters in properties', () => {
    const n8nNode: INode = {
      id: 'params-test',
      name: 'Full Params',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [100, 200],
      parameters: {
        method: 'POST',
        url: 'https://api.example.com',
        headers: { 'Content-Type': 'application/json' },
        body: '={{ JSON.stringify($json) }}',
      },
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.method).toBe('POST');
    expect(wbNode.data.properties.url).toBe('https://api.example.com');
    expect(wbNode.data.properties.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(wbNode.data.properties.body).toBe('={{ JSON.stringify($json) }}');
  });
});

// ---------------------------------------------------------------------------
// mapConnectionsToEdges
// ---------------------------------------------------------------------------

describe('mapConnectionsToEdges', () => {
  const nodeIdByName = new Map<string, string>([
    ['Manual Trigger', 'node-1'],
    ['Set Values', 'node-2'],
    ['HTTP Request', 'node-3'],
    ['If', 'node-4'],
    ['Slack', 'node-5'],
  ]);

  it('converts a simple connection to an edge', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'node-1',
      target: 'node-2',
      sourceHandle: 'output_0',
    });
  });

  it('converts branching connections (multiple outputs)', () => {
    const connections: IConnections = {
      'If': {
        main: [
          [{ node: 'Slack', type: 'main', index: 0 }],
          [{ node: 'HTTP Request', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(2);

    const slackEdge = edges.find((e: WorkflowBuilderEdge) => e.target === 'node-5');
    expect(slackEdge?.sourceHandle).toBe('output_0');

    const httpEdge = edges.find((e: WorkflowBuilderEdge) => e.target === 'node-3');
    expect(httpEdge?.sourceHandle).toBe('output_1');
  });

  it('converts multiple targets from same output', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [
            { node: 'Set Values', type: 'main', index: 0 },
            { node: 'HTTP Request', type: 'main', index: 0 },
          ],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(2);
    expect(edges[0]!.source).toBe('node-1');
    expect(edges[0]!.target).toBe('node-2');
    expect(edges[1]!.source).toBe('node-1');
    expect(edges[1]!.target).toBe('node-3');
  });

  it('sets targetHandle when connection index > 0', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 1 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(1);
    expect(edges[0]!.targetHandle).toBe('input_1');
  });

  it('omits targetHandle when connection index is 0', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(1);
    expect(edges[0]).not.toHaveProperty('targetHandle');
  });

  it('produces correct handle format for AI connection types', () => {
    const connections: IConnections = {
      'Set Values': {
        ai_tool: [
          [{ node: 'HTTP Request', type: 'ai_tool', index: 0 }],
        ],
        ai_memory: [
          [{ node: 'Slack', type: 'ai_memory', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(2);

    const toolEdge = edges.find((e: WorkflowBuilderEdge) => e.target === 'node-3');
    expect(toolEdge?.sourceHandle).toBe('ai_tool_0');

    const memoryEdge = edges.find((e: WorkflowBuilderEdge) => e.target === 'node-5');
    expect(memoryEdge?.sourceHandle).toBe('ai_memory_0');
  });

  it('generates unique edge IDs', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [
            { node: 'Set Values', type: 'main', index: 0 },
            { node: 'HTTP Request', type: 'main', index: 0 },
          ],
        ],
      },
      'Set Values': {
        main: [
          [{ node: 'If', type: 'main', index: 0 }],
        ],
      },
      'If': {
        main: [
          [{ node: 'Slack', type: 'main', index: 0 }],
          [{ node: 'HTTP Request', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    const ids = edges.map((e: WorkflowBuilderEdge) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty array for empty connections', () => {
    const edges = mapConnectionsToEdges({}, nodeIdByName);
    expect(edges).toEqual([]);
  });

  it('skips connections to unknown source nodes', () => {
    const connections: IConnections = {
      'Unknown Node': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);
    expect(edges).toHaveLength(0);
  });

  it('skips connections to unknown target nodes', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [{ node: 'Unknown Target', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);
    expect(edges).toHaveLength(0);
  });

  it('skips null entries in output arrays', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          null,
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ] as any,
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(1);
    expect(edges[0]!.sourceHandle).toBe('output_1');
    expect(edges[0]!.target).toBe('node-2');
  });

  it('handles complex multi-node workflow connections', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ],
      },
      'Set Values': {
        main: [
          [{ node: 'If', type: 'main', index: 0 }],
        ],
      },
      'If': {
        main: [
          [{ node: 'Slack', type: 'main', index: 0 }],
          [{ node: 'HTTP Request', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(4);

    // Manual Trigger -> Set Values
    expect(edges.find((e: WorkflowBuilderEdge) => e.source === 'node-1' && e.target === 'node-2')).toBeDefined();
    // Set Values -> If
    expect(edges.find((e: WorkflowBuilderEdge) => e.source === 'node-2' && e.target === 'node-4')).toBeDefined();
    // If output 0 -> Slack
    const ifSlack = edges.find((e: WorkflowBuilderEdge) => e.source === 'node-4' && e.target === 'node-5');
    expect(ifSlack?.sourceHandle).toBe('output_0');
    // If output 1 -> HTTP Request
    const ifHttp = edges.find((e: WorkflowBuilderEdge) => e.source === 'node-4' && e.target === 'node-3');
    expect(ifHttp?.sourceHandle).toBe('output_1');
  });
});
