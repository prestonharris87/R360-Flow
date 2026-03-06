import { describe, it, expect } from 'vitest';
import { NodeConnectionType } from 'n8n-workflow';

describe('RecordAction node', () => {
  it('has a valid INodeTypeDescription', async () => {
    const { RecordAction } = await import('../nodes/RecordAction.js');
    const node = new RecordAction();

    expect(node.description).toBeDefined();
    expect(node.description.name).toBe('r360.recordAction');
    expect(node.description.displayName).toBe('Record Action');
    expect(node.description.group).toContain('transform');
    expect(node.description.version).toBe(1);
    expect(node.description.inputs).toBeDefined();
    expect(node.description.outputs).toBeDefined();
    expect(node.description.properties.length).toBeGreaterThan(0);
  });

  it('uses NodeConnectionType.Main for inputs and outputs', async () => {
    const { RecordAction } = await import('../nodes/RecordAction.js');
    const node = new RecordAction();

    expect(node.description.inputs).toContain(NodeConnectionType.Main);
    expect(node.description.outputs).toContain(NodeConnectionType.Main);
  });

  it('has required properties with correct types', async () => {
    const { RecordAction } = await import('../nodes/RecordAction.js');
    const node = new RecordAction();
    const { properties } = node.description;

    const actionType = properties.find((p) => p.name === 'actionType');
    expect(actionType).toBeDefined();
    expect(actionType!.type).toBe('options');
    expect(actionType!.required).toBe(true);
    expect(actionType!.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'create' }),
        expect.objectContaining({ value: 'update' }),
        expect.objectContaining({ value: 'archive' }),
      ]),
    );

    const recordId = properties.find((p) => p.name === 'recordId');
    expect(recordId).toBeDefined();
    expect(recordId!.type).toBe('string');

    const data = properties.find((p) => p.name === 'data');
    expect(data).toBeDefined();
    expect(data!.type).toBe('json');
  });

  it('has an execute method', async () => {
    const { RecordAction } = await import('../nodes/RecordAction.js');
    const node = new RecordAction();

    expect(typeof node.execute).toBe('function');
  });
});
