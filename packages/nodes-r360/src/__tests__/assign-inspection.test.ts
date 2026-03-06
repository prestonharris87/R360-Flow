import { describe, it, expect } from 'vitest';
import { NodeConnectionType } from 'n8n-workflow';

describe('AssignInspection node', () => {
  it('has a valid INodeTypeDescription', async () => {
    const { AssignInspection } = await import('../nodes/AssignInspection.js');
    const node = new AssignInspection();

    expect(node.description).toBeDefined();
    expect(node.description.name).toBe('r360.assignInspection');
    expect(node.description.displayName).toBe('Assign Inspection');
    expect(node.description.group).toContain('transform');
    expect(node.description.version).toBe(1);
    expect(node.description.inputs).toBeDefined();
    expect(node.description.outputs).toBeDefined();
    expect(node.description.properties.length).toBeGreaterThan(0);
  });

  it('uses NodeConnectionType.Main for inputs and outputs', async () => {
    const { AssignInspection } = await import('../nodes/AssignInspection.js');
    const node = new AssignInspection();

    expect(node.description.inputs).toContain(NodeConnectionType.Main);
    expect(node.description.outputs).toContain(NodeConnectionType.Main);
  });

  it('has required properties with correct types', async () => {
    const { AssignInspection } = await import('../nodes/AssignInspection.js');
    const node = new AssignInspection();
    const { properties } = node.description;

    const inspectionId = properties.find((p) => p.name === 'inspectionId');
    expect(inspectionId).toBeDefined();
    expect(inspectionId!.type).toBe('string');
    expect(inspectionId!.required).toBe(true);

    const assignee = properties.find((p) => p.name === 'assignee');
    expect(assignee).toBeDefined();
    expect(assignee!.type).toBe('string');
    expect(assignee!.required).toBe(true);

    const priority = properties.find((p) => p.name === 'priority');
    expect(priority).toBeDefined();
    expect(priority!.type).toBe('options');
    expect(priority!.options).toBeDefined();
    expect(priority!.default).toBe('medium');

    const notes = properties.find((p) => p.name === 'notes');
    expect(notes).toBeDefined();
    expect(notes!.type).toBe('string');
  });

  it('has an execute method', async () => {
    const { AssignInspection } = await import('../nodes/AssignInspection.js');
    const node = new AssignInspection();

    expect(typeof node.execute).toBe('function');
  });
});
