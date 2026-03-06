import { describe, it, expect } from 'vitest';
import { NodeConnectionTypes } from 'n8n-workflow';

describe('DocumentAction node', () => {
  it('has a valid INodeTypeDescription', async () => {
    const { DocumentAction } = await import('../nodes/DocumentAction.js');
    const node = new DocumentAction();

    expect(node.description).toBeDefined();
    expect(node.description.name).toBe('r360.documentAction');
    expect(node.description.displayName).toBe('Document Action');
    expect(node.description.group).toContain('transform');
    expect(node.description.version).toBe(1);
    expect(node.description.inputs).toBeDefined();
    expect(node.description.outputs).toBeDefined();
    expect(node.description.properties.length).toBeGreaterThan(0);
  });

  it('uses NodeConnectionTypes.Main for inputs and outputs', async () => {
    const { DocumentAction } = await import('../nodes/DocumentAction.js');
    const node = new DocumentAction();

    expect(node.description.inputs).toContain(NodeConnectionTypes.Main);
    expect(node.description.outputs).toContain(NodeConnectionTypes.Main);
  });

  it('has required properties with correct types', async () => {
    const { DocumentAction } = await import('../nodes/DocumentAction.js');
    const node = new DocumentAction();
    const { properties } = node.description;

    const documentType = properties.find((p) => p.name === 'documentType');
    expect(documentType).toBeDefined();
    expect(documentType!.type).toBe('options');
    expect(documentType!.required).toBe(true);
    expect(documentType!.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'photo' }),
        expect.objectContaining({ value: 'video' }),
        expect.objectContaining({ value: 'signature' }),
        expect.objectContaining({ value: 'note' }),
      ]),
    );

    const inspectionId = properties.find((p) => p.name === 'inspectionId');
    expect(inspectionId).toBeDefined();
    expect(inspectionId!.type).toBe('string');
    expect(inspectionId!.required).toBe(true);

    const fileUrl = properties.find((p) => p.name === 'fileUrl');
    expect(fileUrl).toBeDefined();
    expect(fileUrl!.type).toBe('string');

    const description = properties.find((p) => p.name === 'description');
    expect(description).toBeDefined();
    expect(description!.type).toBe('string');
  });

  it('has an execute method', async () => {
    const { DocumentAction } = await import('../nodes/DocumentAction.js');
    const node = new DocumentAction();

    expect(typeof node.execute).toBe('function');
  });
});
