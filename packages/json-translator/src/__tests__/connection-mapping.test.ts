import { describe, it, expect, vi } from 'vitest';
import {
  mapEdgesToConnections,
  parseSourceHandle,
  parseTargetHandle,
} from '../connection-mapping';
import type { WorkflowBuilderEdge } from '../wb-types';

describe('parseSourceHandle', () => {
  it('returns main/0 for null', () => {
    expect(parseSourceHandle(null)).toEqual({
      connectionType: 'main',
      outputIndex: 0,
    });
  });

  it('returns main/0 for undefined', () => {
    expect(parseSourceHandle(undefined)).toEqual({
      connectionType: 'main',
      outputIndex: 0,
    });
  });

  it('parses "output_0" as main/0', () => {
    expect(parseSourceHandle('output_0')).toEqual({
      connectionType: 'main',
      outputIndex: 0,
    });
  });

  it('parses "output_2" as main/2', () => {
    expect(parseSourceHandle('output_2')).toEqual({
      connectionType: 'main',
      outputIndex: 2,
    });
  });

  it('parses "ai_tool_0" as ai_tool/0', () => {
    expect(parseSourceHandle('ai_tool_0')).toEqual({
      connectionType: 'ai_tool',
      outputIndex: 0,
    });
  });

  it('parses "ai_agent_0" as ai_agent/0', () => {
    expect(parseSourceHandle('ai_agent_0')).toEqual({
      connectionType: 'ai_agent',
      outputIndex: 0,
    });
  });

  it('parses "ai_outputParser_1" as ai_outputParser/1', () => {
    expect(parseSourceHandle('ai_outputParser_1')).toEqual({
      connectionType: 'ai_outputParser',
      outputIndex: 1,
    });
  });

  it('falls back to main/0 for unrecognized handles', () => {
    expect(parseSourceHandle('unknown_handle')).toEqual({
      connectionType: 'main',
      outputIndex: 0,
    });
  });
});

describe('parseTargetHandle', () => {
  it('returns 0 for null', () => {
    expect(parseTargetHandle(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(parseTargetHandle(undefined)).toBe(0);
  });

  it('parses "input_0" as 0', () => {
    expect(parseTargetHandle('input_0')).toBe(0);
  });

  it('parses "input_1" as 1', () => {
    expect(parseTargetHandle('input_1')).toBe(1);
  });

  it('returns 0 for unrecognized handles', () => {
    expect(parseTargetHandle('something_else')).toBe(0);
  });
});

describe('mapEdgesToConnections', () => {
  const nameMap = new Map<string, string>([
    ['node-1', 'Manual Trigger'],
    ['node-2', 'Set Values'],
    ['node-3', 'HTTP Request'],
    ['node-4', 'If'],
    ['node-5', 'Slack'],
    ['node-6', 'Gmail'],
  ]);

  it('maps a simple linear connection', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections).toEqual({
      'Manual Trigger': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ],
      },
    });
  });

  it('maps a chain of three nodes', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2' },
      { id: 'e2', source: 'node-2', target: 'node-3' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections['Manual Trigger']!.main![0]).toEqual([
      { node: 'Set Values', type: 'main', index: 0 },
    ]);
    expect(connections['Set Values']!.main![0]).toEqual([
      { node: 'HTTP Request', type: 'main', index: 0 },
    ]);
  });

  it('maps branching connections (If node with output_0 and output_1)', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-4', target: 'node-5', sourceHandle: 'output_0' },
      { id: 'e2', source: 'node-4', target: 'node-6', sourceHandle: 'output_1' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    // Output 0 -> Slack
    expect(connections['If']!.main![0]).toEqual([
      { node: 'Slack', type: 'main', index: 0 },
    ]);
    // Output 1 -> Gmail
    expect(connections['If']!.main![1]).toEqual([
      { node: 'Gmail', type: 'main', index: 0 },
    ]);
  });

  it('maps multiple edges from same output to different targets', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2' },
      { id: 'e2', source: 'node-1', target: 'node-3' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    // Both targets connected from output 0
    expect(connections['Manual Trigger']!.main![0]).toHaveLength(2);
    expect(connections['Manual Trigger']!.main![0]).toContainEqual(
      { node: 'Set Values', type: 'main', index: 0 },
    );
    expect(connections['Manual Trigger']!.main![0]).toContainEqual(
      { node: 'HTTP Request', type: 'main', index: 0 },
    );
  });

  it('handles edges with targetHandle for multi-input nodes', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-2', target: 'node-3', targetHandle: 'input_1' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections['Set Values']!.main![0]).toEqual([
      { node: 'HTTP Request', type: 'main', index: 1 },
    ]);
  });

  it('handles AI connection types from handle prefixes', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2', sourceHandle: 'ai_tool_0' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections['Manual Trigger']!.ai_tool![0]).toEqual([
      { node: 'Set Values', type: 'ai_tool', index: 0 },
    ]);
  });

  it('handles ai_agent connection type', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2', sourceHandle: 'ai_agent_0' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections['Manual Trigger']!.ai_agent![0]).toEqual([
      { node: 'Set Values', type: 'ai_agent', index: 0 },
    ]);
  });

  it('returns empty object for no edges', () => {
    const connections = mapEdgesToConnections([], nameMap);
    expect(connections).toEqual({});
  });

  it('fills gaps with empty arrays for sparse output indices', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-4', target: 'node-5', sourceHandle: 'output_0' },
      { id: 'e2', source: 'node-4', target: 'node-6', sourceHandle: 'output_2' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    // Output 0 -> Slack
    expect(connections['If']!.main![0]).toEqual([
      { node: 'Slack', type: 'main', index: 0 },
    ]);
    // Output 1 -> empty (gap fill)
    expect(connections['If']!.main![1]).toEqual([]);
    // Output 2 -> Gmail
    expect(connections['If']!.main![2]).toEqual([
      { node: 'Gmail', type: 'main', index: 0 },
    ]);
  });

  it('produces warnings but does not crash for unknown node IDs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'unknown-src', target: 'node-2' },
      { id: 'e2', source: 'node-1', target: 'unknown-tgt' },
      { id: 'e3', source: 'node-1', target: 'node-2' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    // Only the valid edge (e3) should produce a connection
    expect(connections).toEqual({
      'Manual Trigger': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ],
      },
    });

    // Two warnings for the two invalid edges
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown-src'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown-tgt'),
    );

    warnSpy.mockRestore();
  });
});
