import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { translateWBToN8n, translateN8nToWB } from '../index';
import type { DiagramModel } from '../wb-types';
import type { WorkflowParameters } from '../types';

function loadFixture<T>(filename: string): T {
  const filePath = join(__dirname, 'fixtures', filename);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

describe('Round-trip fidelity: WB -> n8n -> WB', () => {
  it('simple linear workflow survives round-trip', () => {
    const originalWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');
    const expectedN8n = loadFixture<WorkflowParameters>('simple-linear-workflow.n8n.json');

    // Forward translation
    const n8nResult = translateWBToN8n(originalWB);

    expect(n8nResult.name).toBe(expectedN8n.name);
    expect(n8nResult.nodes).toHaveLength(expectedN8n.nodes.length);
    expect(n8nResult.active).toBe(false);

    // Verify node names match expected
    for (const expectedNode of expectedN8n.nodes) {
      const actualNode = n8nResult.nodes.find(n => n.id === expectedNode.id);
      expect(actualNode).toBeDefined();
      expect(actualNode!.name).toBe(expectedNode.name);
      expect(actualNode!.type).toBe(expectedNode.type);
      expect(actualNode!.position).toEqual(expectedNode.position);
    }

    // Verify connections
    expect(Object.keys(n8nResult.connections)).toEqual(Object.keys(expectedN8n.connections));

    // Reverse translation
    const roundTripWB = translateN8nToWB(n8nResult);

    expect(roundTripWB.name).toBe(originalWB.name);
    expect(roundTripWB.diagram.nodes).toHaveLength(originalWB.diagram.nodes.length);
    expect(roundTripWB.diagram.edges).toHaveLength(originalWB.diagram.edges.length);

    // Verify node positions and types survive round-trip
    for (const originalNode of originalWB.diagram.nodes) {
      const roundTripNode = roundTripWB.diagram.nodes.find(n => n.id === originalNode.id);
      expect(roundTripNode).toBeDefined();
      expect(roundTripNode!.position).toEqual(originalNode.position);
      expect(roundTripNode!.data.type).toBe(originalNode.data.type);
    }
  });

  it('preserves node count through round-trip', () => {
    const originalWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');
    const n8nResult = translateWBToN8n(originalWB);
    const roundTripWB = translateN8nToWB(n8nResult);

    expect(roundTripWB.diagram.nodes).toHaveLength(originalWB.diagram.nodes.length);
  });

  it('preserves node IDs through round-trip', () => {
    const originalWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');
    const n8nResult = translateWBToN8n(originalWB);
    const roundTripWB = translateN8nToWB(n8nResult);

    const originalIds = originalWB.diagram.nodes.map(n => n.id).sort();
    const roundTripIds = roundTripWB.diagram.nodes.map(n => n.id).sort();
    expect(roundTripIds).toEqual(originalIds);
  });

  it('preserves connection topology through round-trip', () => {
    const originalWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');
    const n8nResult = translateWBToN8n(originalWB);
    const roundTripWB = translateN8nToWB(n8nResult);

    // Same number of edges
    expect(roundTripWB.diagram.edges).toHaveLength(originalWB.diagram.edges.length);

    // Each original edge's source/target relationship is preserved
    for (const originalEdge of originalWB.diagram.edges) {
      const matchingEdge = roundTripWB.diagram.edges.find(
        e => e.source === originalEdge.source && e.target === originalEdge.target,
      );
      expect(matchingEdge).toBeDefined();
    }
  });

  it('expression strings survive round-trip', () => {
    const originalWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');

    const n8nResult = translateWBToN8n(originalWB);
    const roundTripWB = translateN8nToWB(n8nResult);

    // Find the HTTP Request node
    const httpNode = roundTripWB.diagram.nodes.find(
      n => n.data.type === 'httpRequest',
    );
    expect(httpNode).toBeDefined();

    // The bodyParameters contain an expression string
    const bodyParams = httpNode!.data.properties.bodyParameters as {
      parameters: Array<{ value: string }>;
    };
    expect(bodyParams.parameters[0]!.value).toBe('={{ $json.greeting }}');
  });

  it('empty workflow translates both directions without error', () => {
    const emptyWB: DiagramModel = {
      name: 'Empty',
      layoutDirection: 'DOWN',
      diagram: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(emptyWB);
    expect(n8n.nodes).toHaveLength(0);
    expect(n8n.connections).toEqual({});

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes).toHaveLength(0);
    expect(roundTrip.diagram.edges).toHaveLength(0);
  });

  it('single-node workflow (trigger only) translates correctly', () => {
    const singleNode: DiagramModel = {
      name: 'Single Trigger',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'only-node',
            type: 'start-node',
            position: { x: 100, y: 100 },
            data: {
              type: 'manualTrigger',
              icon: 'PlayCircle',
              properties: { label: 'Start' },
            },
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(singleNode);
    expect(n8n.nodes).toHaveLength(1);
    expect(n8n.nodes[0]!.name).toBe('Start');
    expect(n8n.nodes[0]!.type).toBe('manualTrigger');
    expect(n8n.connections).toEqual({});

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes).toHaveLength(1);
    expect(roundTrip.diagram.nodes[0]!.id).toBe('only-node');
    expect(roundTrip.diagram.nodes[0]!.data.type).toBe('manualTrigger');
  });

  it('branching workflow: If node produces 2 output slots', () => {
    const originalWB = loadFixture<DiagramModel>('branching-workflow.wb.json');

    const n8nResult = translateWBToN8n(originalWB);

    // Verify If node has two output branches
    expect(n8nResult.connections['Check Status']).toBeDefined();
    expect(n8nResult.connections['Check Status']!.main).toHaveLength(2);

    // Round-trip back
    const roundTripWB = translateN8nToWB(n8nResult);

    expect(roundTripWB.diagram.nodes).toHaveLength(4);
    expect(roundTripWB.diagram.edges).toHaveLength(3);

    // Verify branching edges have correct source handles
    const branchEdges = roundTripWB.diagram.edges.filter(
      e => e.source === 'node-2',
    );
    expect(branchEdges).toHaveLength(2);
    expect(branchEdges.map(e => e.sourceHandle).sort()).toEqual(['output_0', 'output_1']);
  });

  it('name and settings preserved through translation', () => {
    const originalWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');

    const n8n = translateWBToN8n(originalWB);
    expect(n8n.name).toBe('Simple Linear Workflow');
    expect(n8n.settings).toEqual({ executionOrder: 'v1' });
    expect(n8n.active).toBe(false);

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.name).toBe('Simple Linear Workflow');
    expect(roundTrip.layoutDirection).toBe('RIGHT');
    expect(roundTrip.diagram.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('multi-fixture round-trip with both fixture files', () => {
    // Test simple linear workflow
    const linearWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');
    const linearN8n = translateWBToN8n(linearWB);
    const linearRoundTrip = translateN8nToWB(linearN8n);

    expect(linearRoundTrip.diagram.nodes).toHaveLength(linearWB.diagram.nodes.length);
    expect(linearRoundTrip.diagram.edges).toHaveLength(linearWB.diagram.edges.length);
    for (const node of linearWB.diagram.nodes) {
      const rt = linearRoundTrip.diagram.nodes.find(n => n.id === node.id);
      expect(rt).toBeDefined();
      expect(rt!.data.type).toBe(node.data.type);
      expect(rt!.position).toEqual(node.position);
    }

    // Test branching workflow
    const branchingWB = loadFixture<DiagramModel>('branching-workflow.wb.json');
    const branchingN8n = translateWBToN8n(branchingWB);
    const branchingRoundTrip = translateN8nToWB(branchingN8n);

    expect(branchingRoundTrip.diagram.nodes).toHaveLength(branchingWB.diagram.nodes.length);
    expect(branchingRoundTrip.diagram.edges).toHaveLength(branchingWB.diagram.edges.length);
    for (const node of branchingWB.diagram.nodes) {
      const rt = branchingRoundTrip.diagram.nodes.find(n => n.id === node.id);
      expect(rt).toBeDefined();
      expect(rt!.data.type).toBe(node.data.type);
      expect(rt!.position).toEqual(node.position);
    }
  });
});

describe('Round-trip fidelity: n8n -> WB -> n8n', () => {
  it('n8n workflow format survives round-trip (types stripped to short form)', () => {
    const originalN8n = loadFixture<WorkflowParameters>('simple-linear-workflow.n8n.json');

    // Reverse: n8n -> WB (strips package prefix from data.type)
    const wbResult = translateN8nToWB(originalN8n);

    // Forward: WB -> n8n (uses short type from data.type)
    const roundTripN8n = translateWBToN8n(wbResult);

    expect(roundTripN8n.name).toBe(originalN8n.name);
    expect(roundTripN8n.nodes).toHaveLength(originalN8n.nodes.length);

    // Build a map from original full type to expected short type
    const stripPrefix = (t: string) => {
      const dot = t.lastIndexOf('.');
      return dot === -1 ? t : t.substring(dot + 1);
    };

    for (const originalNode of originalN8n.nodes) {
      const roundTripNode = roundTripN8n.nodes.find(n => n.id === originalNode.id);
      expect(roundTripNode).toBeDefined();
      // Type is intentionally stripped to short form through the round-trip
      expect(roundTripNode!.type).toBe(stripPrefix(originalNode.type));
      expect(roundTripNode!.name).toBe(originalNode.name);
      expect(roundTripNode!.position).toEqual(originalNode.position);
    }
  });

  it('preserves node names through n8n -> WB -> n8n (types stripped to short form)', () => {
    const originalN8n = loadFixture<WorkflowParameters>('simple-linear-workflow.n8n.json');

    const wbResult = translateN8nToWB(originalN8n);
    const roundTripN8n = translateWBToN8n(wbResult);

    const stripPrefix = (t: string) => {
      const dot = t.lastIndexOf('.');
      return dot === -1 ? t : t.substring(dot + 1);
    };

    for (const originalNode of originalN8n.nodes) {
      const roundTripNode = roundTripN8n.nodes.find(n => n.id === originalNode.id);
      expect(roundTripNode).toBeDefined();
      // Type is intentionally stripped to short form through the round-trip
      expect(roundTripNode!.type).toBe(stripPrefix(originalNode.type));
      expect(roundTripNode!.name).toBe(originalNode.name);
    }
  });
});
