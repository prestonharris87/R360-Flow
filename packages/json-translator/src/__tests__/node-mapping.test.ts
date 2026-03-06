import { describe, it, expect } from 'vitest';
import { mapWBNodeToN8nNode, buildNodeNameMap } from '../node-mapping';
import type { WorkflowBuilderNode } from '../wb-types';

describe('mapWBNodeToN8nNode', () => {
  it('maps a trigger node correctly (position, type, name)', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-1',
      type: 'start-node',
      position: { x: 250, y: 100 },
      data: {
        type: 'n8n-nodes-base.manualTrigger',
        icon: 'PlayCircle',
        properties: {
          label: 'When clicking "Test workflow"',
          description: 'Manual trigger',
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);

    expect(result).toEqual({
      id: 'node-1',
      name: 'When clicking "Test workflow"',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 100],
      parameters: {},
    });
  });

  it('maps a regular node with parameters (metadata stripped, params preserved)', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-2',
      type: 'node',
      position: { x: 500, y: 100 },
      data: {
        type: 'n8n-nodes-base.set',
        icon: 'PenTool',
        properties: {
          label: 'Set Values',
          description: 'Set data',
          mode: 'manual',
          duplicateItem: false,
          assignments: {
            assignments: [
              { name: 'firstName', value: 'John', type: 'string' },
            ],
          },
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);

    expect(result.id).toBe('node-2');
    expect(result.name).toBe('Set Values');
    expect(result.type).toBe('n8n-nodes-base.set');
    expect(result.position).toEqual([500, 100]);
    expect(result.parameters).toEqual({
      mode: 'manual',
      duplicateItem: false,
      assignments: {
        assignments: [
          { name: 'firstName', value: 'John', type: 'string' },
        ],
      },
    });
    // Metadata properties should NOT appear in parameters
    expect(result.parameters).not.toHaveProperty('label');
    expect(result.parameters).not.toHaveProperty('description');
  });

  it('uses NODE_TYPE_DISPLAY_NAMES fallback when label is missing', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-3',
      type: 'node',
      position: { x: 300, y: 200 },
      data: {
        type: 'n8n-nodes-base.httpRequest',
        icon: 'Globe',
        properties: {},
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.name).toBe('HTTP Request');
  });

  it('derives name from camelCase split when label is missing and type is unknown', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-unknown',
      type: 'node',
      position: { x: 100, y: 100 },
      data: {
        type: 'n8n-nodes-base.myCustomNode',
        icon: 'Zap',
        properties: {},
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    // "myCustomNode" -> "my Custom Node"
    expect(result.name).toBe('my Custom Node');
  });

  it('extracts typeVersion from properties (not in params)', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-4',
      type: 'node',
      position: { x: 100, y: 100 },
      data: {
        type: 'n8n-nodes-base.httpRequest',
        icon: 'Globe',
        properties: {
          label: 'Fetch Data',
          typeVersion: 4,
          method: 'GET',
          url: 'https://api.example.com/data',
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.typeVersion).toBe(4);
    // typeVersion should NOT be in parameters
    expect(result.parameters).not.toHaveProperty('typeVersion');
    // Other properties should be in parameters
    expect(result.parameters).toHaveProperty('method', 'GET');
    expect(result.parameters).toHaveProperty('url', 'https://api.example.com/data');
  });

  it('defaults typeVersion to 1 when not specified', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-default-version',
      type: 'node',
      position: { x: 0, y: 0 },
      data: {
        type: 'n8n-nodes-base.set',
        icon: 'PenTool',
        properties: { label: 'Test' },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.typeVersion).toBe(1);
  });

  it('sets disabled as INode top-level field (not in params)', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-5',
      type: 'node',
      position: { x: 100, y: 100 },
      data: {
        type: 'n8n-nodes-base.noOp',
        icon: 'Minus',
        properties: {
          label: 'Disabled Node',
          disabled: true,
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.disabled).toBe(true);
    expect(result.parameters).not.toHaveProperty('disabled');
  });

  it('sets notes as INode top-level field (not in params)', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-notes',
      type: 'node',
      position: { x: 200, y: 200 },
      data: {
        type: 'n8n-nodes-base.code',
        icon: 'Code',
        properties: {
          label: 'My Code',
          notes: 'This node does important processing',
          notesInFlow: true,
          jsCode: 'return items;',
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.notes).toBe('This node does important processing');
    expect(result.notesInFlow).toBe(true);
    expect(result.parameters).not.toHaveProperty('notes');
    expect(result.parameters).not.toHaveProperty('notesInFlow');
    expect(result.parameters).toHaveProperty('jsCode', 'return items;');
  });

  it('maps credentials correctly as INode top-level field', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-creds',
      type: 'node',
      position: { x: 300, y: 300 },
      data: {
        type: 'n8n-nodes-base.slack',
        icon: 'Slack',
        properties: {
          label: 'Post Message',
          credentials: {
            slackApi: { id: 'cred-123', name: 'My Slack Account' },
          },
          channel: '#general',
          text: 'Hello!',
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.credentials).toEqual({
      slackApi: { id: 'cred-123', name: 'My Slack Account' },
    });
    expect(result.parameters).not.toHaveProperty('credentials');
    expect(result.parameters).toHaveProperty('channel', '#general');
    expect(result.parameters).toHaveProperty('text', 'Hello!');
  });

  it('does not set optional fields when not present in properties', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-minimal',
      type: 'node',
      position: { x: 0, y: 0 },
      data: {
        type: 'n8n-nodes-base.noOp',
        icon: 'Minus',
        properties: { label: 'Simple' },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.disabled).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.notesInFlow).toBeUndefined();
    expect(result.continueOnFail).toBeUndefined();
    expect(result.onError).toBeUndefined();
    expect(result.credentials).toBeUndefined();
    expect(result.retryOnFail).toBeUndefined();
    expect(result.maxTries).toBeUndefined();
    expect(result.waitBetweenTries).toBeUndefined();
  });

  it('strips color and icon from parameters (they are meta properties)', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-color',
      type: 'node',
      position: { x: 0, y: 0 },
      data: {
        type: 'n8n-nodes-base.set',
        icon: 'PenTool',
        properties: {
          label: 'Colored Node',
          color: '#ff6600',
          icon: 'custom-icon',
          mode: 'manual',
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.parameters).not.toHaveProperty('color');
    expect(result.parameters).not.toHaveProperty('icon');
    expect(result.parameters).toHaveProperty('mode', 'manual');
  });
});

describe('buildNodeNameMap', () => {
  it('maps node IDs to unique names', () => {
    const nodes: WorkflowBuilderNode[] = [
      {
        id: 'node-1',
        position: { x: 0, y: 0 },
        data: { type: 'n8n-nodes-base.set', icon: '', properties: { label: 'Set' } },
      },
      {
        id: 'node-2',
        position: { x: 100, y: 0 },
        data: { type: 'n8n-nodes-base.set', icon: '', properties: { label: 'Set' } },
      },
    ];

    const nameMap = buildNodeNameMap(nodes);
    expect(nameMap.get('node-1')).toBe('Set');
    expect(nameMap.get('node-2')).toBe('Set 1');
  });

  it('handles three or more duplicates with incrementing suffixes', () => {
    const nodes: WorkflowBuilderNode[] = [
      {
        id: 'a',
        position: { x: 0, y: 0 },
        data: { type: 'n8n-nodes-base.set', icon: '', properties: { label: 'Set' } },
      },
      {
        id: 'b',
        position: { x: 100, y: 0 },
        data: { type: 'n8n-nodes-base.set', icon: '', properties: { label: 'Set' } },
      },
      {
        id: 'c',
        position: { x: 200, y: 0 },
        data: { type: 'n8n-nodes-base.set', icon: '', properties: { label: 'Set' } },
      },
    ];

    const nameMap = buildNodeNameMap(nodes);
    expect(nameMap.get('a')).toBe('Set');
    expect(nameMap.get('b')).toBe('Set 1');
    expect(nameMap.get('c')).toBe('Set 2');
  });

  it('does not add suffix when names are already unique', () => {
    const nodes: WorkflowBuilderNode[] = [
      {
        id: 'node-1',
        position: { x: 0, y: 0 },
        data: { type: 'n8n-nodes-base.set', icon: '', properties: { label: 'Set Values' } },
      },
      {
        id: 'node-2',
        position: { x: 100, y: 0 },
        data: { type: 'n8n-nodes-base.httpRequest', icon: '', properties: { label: 'Fetch Data' } },
      },
    ];

    const nameMap = buildNodeNameMap(nodes);
    expect(nameMap.get('node-1')).toBe('Set Values');
    expect(nameMap.get('node-2')).toBe('Fetch Data');
  });

  it('uses display name fallback for nodes without labels', () => {
    const nodes: WorkflowBuilderNode[] = [
      {
        id: 'node-1',
        position: { x: 0, y: 0 },
        data: { type: 'n8n-nodes-base.httpRequest', icon: '', properties: {} },
      },
      {
        id: 'node-2',
        position: { x: 100, y: 0 },
        data: { type: 'n8n-nodes-base.httpRequest', icon: '', properties: {} },
      },
    ];

    const nameMap = buildNodeNameMap(nodes);
    expect(nameMap.get('node-1')).toBe('HTTP Request');
    expect(nameMap.get('node-2')).toBe('HTTP Request 1');
  });
});
