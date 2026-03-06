import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bootstrapN8nContainer, resetBootstrap } from '../bootstrap.js';
import { R360NodeTypes } from '../node-types.js';

const TEST_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';

describe('R360NodeTypes', () => {
  let nodeTypes: R360NodeTypes;
  let testUserFolder: string;

  beforeAll(async () => {
    // Create a temporary directory for n8n state
    testUserFolder = mkdtempSync(path.join(tmpdir(), 'r360-node-types-test-'));

    // Bootstrap DI first (required for LazyPackageDirectoryLoader)
    resetBootstrap();
    await bootstrapN8nContainer({
      encryptionKey: TEST_ENCRYPTION_KEY,
      userFolder: testUserFolder,
    });

    nodeTypes = new R360NodeTypes();
    await nodeTypes.init();
  }, 60000); // Loading n8n-nodes-base may take a while

  afterAll(() => {
    try {
      rmSync(testUserFolder, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  it('implements INodeTypes interface', () => {
    expect(typeof nodeTypes.getByName).toBe('function');
    expect(typeof nodeTypes.getByNameAndVersion).toBe('function');
    expect(typeof nodeTypes.getKnownTypes).toBe('function');
  });

  it('loads ManualTrigger node type', () => {
    const manualTrigger = nodeTypes.getByNameAndVersion(
      'n8n-nodes-base.manualTrigger'
    );
    expect(manualTrigger).toBeDefined();
    expect(manualTrigger.description).toBeDefined();
    // Node description.name is the short name (without package prefix).
    // The full prefixed name (n8n-nodes-base.manualTrigger) is the lookup key,
    // but the node class itself declares just 'manualTrigger'.
    expect(manualTrigger.description.name).toBe('manualTrigger');
  });

  it('loads HttpRequest node type', () => {
    const httpRequest = nodeTypes.getByNameAndVersion(
      'n8n-nodes-base.httpRequest'
    );
    expect(httpRequest).toBeDefined();
    expect(httpRequest.description.name).toBe('httpRequest');
  });

  it('loads Set node type', () => {
    const setNode = nodeTypes.getByNameAndVersion('n8n-nodes-base.set');
    expect(setNode).toBeDefined();
  });

  it('returns known types as a non-empty object', () => {
    const known = nodeTypes.getKnownTypes();
    expect(known).toBeDefined();
    expect(Object.keys(known).length).toBeGreaterThan(0);
  });

  it('throws for unknown node type', () => {
    expect(() => {
      nodeTypes.getByNameAndVersion('n8n-nodes-base.nonExistentNode');
    }).toThrow();
  });

  it('enumerates available node type descriptions', () => {
    const descriptions = nodeTypes.getNodeTypeDescriptions();
    expect(Array.isArray(descriptions)).toBe(true);
    expect(descriptions.length).toBeGreaterThan(100); // n8n-nodes-base has 400+
  });

  it('caches loaded node types (second access is fast)', () => {
    // First access (may trigger lazy loading)
    const start = performance.now();
    nodeTypes.getByNameAndVersion('n8n-nodes-base.manualTrigger');
    const firstAccess = performance.now() - start;

    // Second access (should come from cache)
    const start2 = performance.now();
    nodeTypes.getByNameAndVersion('n8n-nodes-base.manualTrigger');
    const secondAccess = performance.now() - start2;

    // Second access should be at most as fast as first (cached)
    expect(secondAccess).toBeLessThan(firstAccess + 1);
  });

  it('returns same instance on repeated getByName calls (cache hit)', () => {
    const first = nodeTypes.getByName('n8n-nodes-base.manualTrigger');
    const second = nodeTypes.getByName('n8n-nodes-base.manualTrigger');
    expect(first).toBe(second); // Same object reference
  });

  it('registers and retrieves custom node types', () => {
    const customNode: INodeType = {
      description: {
        displayName: 'Test Custom Node',
        name: 'r360.testCustomNode',
        group: ['transform'],
        version: 1,
        description: 'A test custom node',
        defaults: { name: 'Test Custom' },
        inputs: ['main'],
        outputs: ['main'],
        properties: [],
      } as INodeTypeDescription,
      async execute() {
        return [[]];
      },
    };

    nodeTypes.registerCustomNodeType('r360.testCustomNode', customNode);

    const resolved = nodeTypes.getByNameAndVersion('r360.testCustomNode');
    expect(resolved).toBeDefined();
    expect(resolved.description.name).toBe('r360.testCustomNode');
    expect(resolved.description.displayName).toBe('Test Custom Node');
  });

  it('custom nodes appear in getNodeTypeDescriptions()', () => {
    // Custom node registered in previous test should appear in descriptions
    const descriptions = nodeTypes.getNodeTypeDescriptions();
    const customDesc = descriptions.find(
      (d) => d.name === 'r360.testCustomNode'
    );
    expect(customDesc).toBeDefined();
    expect(customDesc?.displayName).toBe('Test Custom Node');
  });

  it('custom nodes take priority over built-in nodes', () => {
    const overrideNode: INodeType = {
      description: {
        displayName: 'Override Node',
        name: 'n8n-nodes-base.manualTrigger',
        group: ['trigger'],
        version: 1,
        description: 'An override',
        defaults: { name: 'Override' },
        inputs: [],
        outputs: ['main'],
        properties: [],
      } as INodeTypeDescription,
      async execute() {
        return [[]];
      },
    };

    // Create a separate instance to avoid polluting the shared one
    const freshNodeTypes = new R360NodeTypes();
    // Register before init to test custom priority
    freshNodeTypes.registerCustomNodeType(
      'n8n-nodes-base.manualTrigger',
      overrideNode
    );

    // getByName should return the custom node even without init
    // (custom nodes don't require the loader)
    const resolved = freshNodeTypes.getByName('n8n-nodes-base.manualTrigger');
    expect(resolved.description.displayName).toBe('Override Node');
  });

  it('throws descriptive error when not initialized', () => {
    const uninitNodeTypes = new R360NodeTypes();
    expect(() => {
      uninitNodeTypes.getKnownTypes();
    }).toThrow('R360NodeTypes not initialized');
  });

  it('init is idempotent (second call is a no-op)', async () => {
    // The nodeTypes instance is already initialized from beforeAll
    // Calling init again should not throw or reset state
    await nodeTypes.init();

    // Should still work after double init
    const manualTrigger = nodeTypes.getByNameAndVersion(
      'n8n-nodes-base.manualTrigger'
    );
    expect(manualTrigger).toBeDefined();
  });
});
