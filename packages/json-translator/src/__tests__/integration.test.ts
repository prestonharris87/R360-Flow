import { describe, it, expect } from 'vitest';
import { translateWBToN8n, translateN8nToWB } from '../index';
import type { DiagramModel } from '../wb-types';

describe('Phase 2 Integration: Full Translation Pipeline', () => {
  it('handles a complex workflow with multiple node types', () => {
    const complexWorkflow: DiagramModel = {
      name: 'Customer Onboarding',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'trigger-1',
            type: 'start-node',
            position: { x: 0, y: 300 },
            data: {
              type: 'n8n-nodes-base.webhook',
              icon: 'Webhook',
              properties: {
                label: 'New Signup Webhook',
                httpMethod: 'POST',
                path: 'signup',
              },
            },
          },
          {
            id: 'validate-1',
            type: 'node',
            position: { x: 250, y: 300 },
            data: {
              type: 'n8n-nodes-base.set',
              icon: 'PenTool',
              properties: {
                label: 'Normalize Data',
                mode: 'manual',
                assignments: {
                  assignments: [
                    { name: 'email', value: '={{ $json.email.toLowerCase() }}', type: 'string' },
                    { name: 'name', value: '={{ $json.firstName }} {{ $json.lastName }}', type: 'string' },
                  ],
                },
              },
            },
          },
          {
            id: 'check-1',
            type: 'decision-node',
            position: { x: 500, y: 300 },
            data: {
              type: 'n8n-nodes-base.if',
              icon: 'GitBranch',
              properties: {
                label: 'Is Enterprise?',
                conditions: {
                  conditions: [
                    {
                      leftValue: '={{ $json.plan }}',
                      rightValue: 'enterprise',
                      operator: { type: 'string', operation: 'equals' },
                    },
                  ],
                },
              },
            },
          },
          {
            id: 'slack-1',
            type: 'node',
            position: { x: 750, y: 200 },
            data: {
              type: 'n8n-nodes-base.slack',
              icon: 'MessageSquare',
              properties: {
                label: 'Alert Sales Team',
                resource: 'message',
                operation: 'post',
                channel: 'sales-alerts',
                text: '={{ "Enterprise signup: " + $json.name }}',
              },
            },
          },
          {
            id: 'email-1',
            type: 'node',
            position: { x: 750, y: 400 },
            data: {
              type: 'n8n-nodes-base.gmail',
              icon: 'Mail',
              properties: {
                label: 'Send Welcome Email',
                resource: 'message',
                operation: 'send',
                sendTo: '={{ $json.email }}',
                subject: 'Welcome to R360!',
              },
            },
          },
        ],
        edges: [
          { id: 'e-0', source: 'trigger-1', target: 'validate-1' },
          { id: 'e-1', source: 'validate-1', target: 'check-1' },
          { id: 'e-2', source: 'check-1', target: 'slack-1', sourceHandle: 'output_0' },
          { id: 'e-3', source: 'check-1', target: 'email-1', sourceHandle: 'output_1' },
        ],
        viewport: { x: 0, y: 0, zoom: 0.8 },
      },
    };

    // Forward translation
    const n8n = translateWBToN8n(complexWorkflow);

    // Structural validation
    expect(n8n.nodes).toHaveLength(5);
    expect(n8n.name).toBe('Customer Onboarding');
    expect(n8n.active).toBe(false);

    // All node names unique
    const nodeNames = n8n.nodes.map(n => n.name);
    expect(new Set(nodeNames).size).toBe(5);

    // Trigger node correct
    const trigger = n8n.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
    expect(trigger).toBeDefined();
    expect(trigger!.parameters.httpMethod).toBe('POST');
    expect(trigger!.parameters.path).toBe('signup');

    // If node branches
    expect(n8n.connections['Is Enterprise?']).toBeDefined();
    expect(n8n.connections['Is Enterprise?']!.main).toHaveLength(2);

    // Expression parameters preserved
    const setNode = n8n.nodes.find(n => n.name === 'Normalize Data');
    expect(setNode).toBeDefined();
    const assignments = (setNode!.parameters.assignments as { assignments: Array<{ value: string }> }).assignments;
    expect(assignments[0]!.value).toBe('={{ $json.email.toLowerCase() }}');

    // Round-trip
    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes).toHaveLength(5);
    expect(roundTrip.diagram.edges).toHaveLength(4);

    // Verify branching edges exist in round-trip
    const ifEdges = roundTrip.diagram.edges.filter(e => e.source === 'check-1');
    expect(ifEdges).toHaveLength(2);
  });

  it('handles an empty workflow', () => {
    const emptyWorkflow: DiagramModel = {
      name: 'Empty',
      layoutDirection: 'DOWN',
      diagram: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(emptyWorkflow);
    expect(n8n.nodes).toHaveLength(0);
    expect(n8n.connections).toEqual({});

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes).toHaveLength(0);
    expect(roundTrip.diagram.edges).toHaveLength(0);
  });

  it('handles a single-node workflow (no edges)', () => {
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
              type: 'n8n-nodes-base.manualTrigger',
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
    expect(n8n.connections).toEqual({});

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes).toHaveLength(1);
    expect(roundTrip.diagram.nodes[0]!.id).toBe('only-node');
  });

  it('preserves node IDs through full pipeline', () => {
    const workflow: DiagramModel = {
      name: 'ID Preservation',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'uuid-aaaa-bbbb-cccc',
            type: 'node',
            position: { x: 0, y: 0 },
            data: {
              type: 'n8n-nodes-base.code',
              icon: 'Code',
              properties: {
                label: 'Custom Code',
                jsCode: 'return items;',
              },
            },
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(workflow);
    expect(n8n.nodes[0]!.id).toBe('uuid-aaaa-bbbb-cccc');

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes[0]!.id).toBe('uuid-aaaa-bbbb-cccc');
  });

  it('edge/connection topology preserved through round-trip', () => {
    const workflow: DiagramModel = {
      name: 'Topology Test',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'a',
            type: 'start-node',
            position: { x: 0, y: 0 },
            data: {
              type: 'n8n-nodes-base.manualTrigger',
              icon: 'PlayCircle',
              properties: { label: 'Trigger' },
            },
          },
          {
            id: 'b',
            type: 'node',
            position: { x: 200, y: 0 },
            data: {
              type: 'n8n-nodes-base.set',
              icon: 'PenTool',
              properties: { label: 'Set' },
            },
          },
          {
            id: 'c',
            type: 'node',
            position: { x: 400, y: 0 },
            data: {
              type: 'n8n-nodes-base.httpRequest',
              icon: 'Globe',
              properties: { label: 'HTTP' },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'c' },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(workflow);
    const roundTrip = translateN8nToWB(n8n);

    expect(roundTrip.diagram.edges).toHaveLength(2);

    // Verify source->target pairs
    const edgePairs = roundTrip.diagram.edges.map(e => `${e.source}->${e.target}`).sort();
    expect(edgePairs).toEqual(['a->b', 'b->c']);
  });

  it('translateWBToN8n sets active=false and executionOrder=v1', () => {
    const workflow: DiagramModel = {
      name: 'Settings Test',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(workflow);
    expect(n8n.active).toBe(false);
    expect(n8n.settings).toBeDefined();
    expect(n8n.settings!.executionOrder).toBe('v1');
  });

  it('translateN8nToWB sets layoutDirection=RIGHT and default viewport', () => {
    const n8nWorkflow: import('../types.js').WorkflowParameters = {
      name: 'Reverse Defaults Test',
      nodes: [],
      connections: {},
      active: true,
    };

    const wb = translateN8nToWB(n8nWorkflow);
    expect(wb.layoutDirection).toBe('RIGHT');
    expect(wb.diagram.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(wb.diagram.nodes).toHaveLength(0);
    expect(wb.diagram.edges).toHaveLength(0);
  });
});
