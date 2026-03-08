import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INodeTypeDescription } from 'n8n-workflow';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bootstrapN8nContainer, resetBootstrap } from '../bootstrap';
import { R360NodeTypes } from '../node-types';
import {
  convertToPaletteItem,
  convertN8nPropertiesToSchema,
  buildNodePalette,
} from '../node-palette';
import type { ConditionalRule } from '../node-palette';

const TEST_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';

describe('convertToPaletteItem', () => {
  it('converts an n8n node description to PaletteItem with required fields', () => {
    const n8nDesc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.httpRequest',
      displayName: 'HTTP Request',
      description: 'Makes an HTTP request and returns the response',
      icon: 'file:httpRequest.svg',
      group: ['output'],
      version: 1,
      defaults: { name: 'HTTP Request' },
      codex: {
        categories: ['Development'],
        subcategories: {
          Development: ['HTTP'],
        },
      },
      properties: [
        {
          displayName: 'Method',
          name: 'method',
          type: 'options',
          default: 'GET',
          description: 'The request method',
          options: [
            { name: 'GET', value: 'GET' },
            { name: 'POST', value: 'POST' },
            { name: 'PUT', value: 'PUT' },
            { name: 'DELETE', value: 'DELETE' },
          ],
        },
        {
          displayName: 'URL',
          name: 'url',
          type: 'string',
          default: '',
          description: 'The URL to make the request to',
          placeholder: 'https://example.com',
        },
      ],
      inputs: ['main'],
      outputs: ['main'],
    };

    const paletteItem = convertToPaletteItem(
      n8nDesc as INodeTypeDescription
    );

    expect(paletteItem.type).toBe('n8n-nodes-base.httpRequest');
    expect(paletteItem.label).toBe('HTTP Request');
    expect(paletteItem.description).toBe(
      'Makes an HTTP request and returns the response'
    );
    expect(paletteItem.icon).toBe('file:httpRequest.svg');
    expect(paletteItem.category).toBe('Development');
    expect(paletteItem.schema).toBeDefined();
    expect(paletteItem.schema.properties).toBeDefined();
    expect(paletteItem.defaultPropertiesData).toBeDefined();
    expect(paletteItem.defaultPropertiesData.label).toBe('HTTP Request');
  });

  it('includes credentials when present on node description', () => {
    const desc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.slack',
      displayName: 'Slack',
      description: 'Interact with Slack',
      group: ['output'],
      version: 1,
      defaults: { name: 'Slack' },
      properties: [],
      inputs: ['main'],
      outputs: ['main'],
      credentials: [
        { name: 'slackApi', required: true, displayName: 'Slack API' },
        { name: 'slackOAuth2Api' },
      ],
    };

    const item = convertToPaletteItem(desc as INodeTypeDescription);
    expect(item.credentials).toBeDefined();
    expect(item.credentials).toHaveLength(2);
    expect(item.credentials![0]).toEqual({
      name: 'slackApi',
      required: true,
      displayName: 'Slack API',
    });
    expect(item.credentials![1]).toEqual({ name: 'slackOAuth2Api' });
  });

  it('does not include credentials key when none present', () => {
    const desc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.set',
      displayName: 'Set',
      description: 'Sets a value',
      group: ['input'],
      version: 1,
      defaults: { name: 'Set' },
      properties: [],
      inputs: ['main'],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(desc as INodeTypeDescription);
    expect(item.credentials).toBeUndefined();
  });

  it('maps trigger nodes to trigger templateType (group includes trigger)', () => {
    const triggerDesc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.manualTrigger',
      displayName: 'Manual Trigger',
      description: 'Runs the workflow manually',
      group: ['trigger'],
      version: 1,
      defaults: { name: 'Manual Trigger' },
      properties: [],
      inputs: [],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(
      triggerDesc as INodeTypeDescription
    );

    expect(item.templateType).toBe('trigger');
  });

  it('maps trigger nodes to trigger templateType (name includes trigger)', () => {
    const triggerDesc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.scheduleTrigger',
      displayName: 'Schedule Trigger',
      description: 'Triggers the workflow on a schedule',
      group: ['schedule'],
      version: 1,
      defaults: { name: 'Schedule Trigger' },
      properties: [],
      inputs: [],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(
      triggerDesc as INodeTypeDescription
    );

    expect(item.templateType).toBe('trigger');
  });

  it('maps webhook nodes to trigger templateType', () => {
    const webhookDesc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.webhook',
      displayName: 'Webhook',
      description: 'Starts the workflow when a webhook is called',
      group: ['output'],
      version: 1,
      defaults: { name: 'Webhook' },
      properties: [],
      inputs: [],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(
      webhookDesc as INodeTypeDescription
    );

    expect(item.templateType).toBe('trigger');
  });

  it('maps regular action nodes to action templateType', () => {
    const actionDesc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.set',
      displayName: 'Set',
      description: 'Sets a value',
      group: ['input'],
      version: 1,
      defaults: { name: 'Set' },
      properties: [],
      inputs: ['main'],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(
      actionDesc as INodeTypeDescription
    );

    expect(item.templateType).toBe('action');
  });

  it('uses default icon when icon is not a string', () => {
    const desc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.test',
      displayName: 'Test',
      description: 'Test node',
      group: ['transform'],
      version: 1,
      defaults: { name: 'Test' },
      properties: [],
      inputs: ['main'],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(desc as INodeTypeDescription);
    expect(item.icon).toBe('default-node-icon');
  });

  it('falls back to group for category when codex is missing', () => {
    const desc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.test',
      displayName: 'Test',
      description: 'Test node',
      group: ['transform'],
      version: 1,
      defaults: { name: 'Test' },
      properties: [],
      inputs: ['main'],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(desc as INodeTypeDescription);
    expect(item.category).toBe('transform');
  });

  it('falls back to other when both codex and group are missing', () => {
    const desc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.test',
      displayName: 'Test',
      description: 'Test node',
      group: [],
      version: 1,
      defaults: { name: 'Test' },
      properties: [],
      inputs: ['main'],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(desc as INodeTypeDescription);
    expect(item.category).toBe('other');
  });
});

describe('convertN8nPropertiesToSchema', () => {
  it('converts string properties with description', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        default: '',
        description: 'The name',
        placeholder: 'Enter name',
      },
    ] as any);

    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.name!.type).toBe('string');
    expect(schema.properties.name!.label).toBe('Name');
    expect(schema.properties.name!.placeholder).toBe('Enter name');
    expect(schema.properties.name!.description).toBe('The name');
  });

  it('converts number properties with min/max from typeOptions', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Count',
        name: 'count',
        type: 'number',
        default: 0,
        description: 'The count',
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
      },
    ] as any);

    expect(schema.properties.count).toBeDefined();
    expect(schema.properties.count!.type).toBe('number');
    expect(schema.properties.count!.label).toBe('Count');
    expect(schema.properties.count!.minimum).toBe(1);
    expect(schema.properties.count!.maximum).toBe(100);
  });

  it('converts boolean properties', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Active',
        name: 'active',
        type: 'boolean',
        default: false,
        description: 'Whether active',
      },
    ] as any);

    expect(schema.properties.active).toBeDefined();
    expect(schema.properties.active!.type).toBe('boolean');
    expect(schema.properties.active!.label).toBe('Active');
  });

  it('converts options properties with label/value', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
        ],
      },
    ] as any);

    expect(schema.properties.method).toBeDefined();
    expect(schema.properties.method!.type).toBe('string');
    expect(schema.properties.method!.options).toHaveLength(2);
    expect(schema.properties.method!.options![0]).toEqual({
      label: 'GET',
      value: 'GET',
    });
  });

  it('converts collection properties with nested sub-fields', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        default: {},
        options: [
          {
            displayName: 'Timeout',
            name: 'timeout',
            type: 'number',
            default: 30,
            description: 'Timeout in seconds',
          },
          {
            displayName: 'Follow Redirects',
            name: 'followRedirects',
            type: 'boolean',
            default: true,
          },
        ],
      },
    ] as any);

    expect(schema.properties.options).toBeDefined();
    expect(schema.properties.options!.type).toBe('object');
    expect(schema.properties.options!.properties).toBeDefined();
    expect(schema.properties.options!.properties!.timeout).toBeDefined();
    expect(schema.properties.options!.properties!.timeout!.type).toBe('number');
    expect(schema.properties.options!.properties!.followRedirects).toBeDefined();
    expect(schema.properties.options!.properties!.followRedirects!.type).toBe('boolean');
  });

  it('converts fixedCollection properties with nested groups', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Items',
        name: 'items',
        type: 'fixedCollection',
        default: {},
        options: [
          {
            displayName: 'Headers',
            name: 'headers',
            values: [
              {
                displayName: 'Key',
                name: 'key',
                type: 'string',
                default: '',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
              },
            ],
          },
        ],
      },
    ] as any);

    expect(schema.properties.items).toBeDefined();
    expect(schema.properties.items!.type).toBe('object');
    expect(schema.properties.items!.properties).toBeDefined();
    const headers = schema.properties.items!.properties!.headers;
    expect(headers).toBeDefined();
    expect(headers!.type).toBe('object');
    expect(headers!.label).toBe('Headers');
    expect(headers!.properties!.key).toBeDefined();
    expect(headers!.properties!.value).toBeDefined();
  });

  it('always includes label and description in schema', () => {
    const schema = convertN8nPropertiesToSchema([]);
    expect(schema.properties.label).toBeDefined();
    expect(schema.properties.label!.type).toBe('string');
    expect(schema.properties.description).toBeDefined();
    expect(schema.properties.description!.type).toBe('string');
  });

  it('converts json type to string with format json', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Custom',
        name: 'custom',
        type: 'json',
        default: '',
      },
    ] as any);

    expect(schema.properties.custom).toBeDefined();
    expect(schema.properties.custom!.type).toBe('string');
    expect(schema.properties.custom!.format).toBe('json');
  });

  it('converts dateTime type to string with format date-time', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Start Date',
        name: 'startDate',
        type: 'dateTime',
        default: '',
      },
    ] as any);

    expect(schema.properties.startDate!.type).toBe('string');
    expect(schema.properties.startDate!.format).toBe('date-time');
  });

  it('converts color type to string with format color', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Color',
        name: 'color',
        type: 'color',
        default: '#000000',
      },
    ] as any);

    expect(schema.properties.color!.type).toBe('string');
    expect(schema.properties.color!.format).toBe('color');
  });

  it('skips notice types', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Note',
        name: 'note',
        type: 'notice',
        default: '',
      },
    ] as any);

    expect(schema.properties.note).toBeUndefined();
  });

  it('converts multiOptions to array type', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Tags',
        name: 'tags',
        type: 'multiOptions',
        default: [],
        options: [
          { name: 'Alpha', value: 'alpha' },
          { name: 'Beta', value: 'beta' },
        ],
      },
    ] as any);

    expect(schema.properties.tags!.type).toBe('array');
    expect(schema.properties.tags!.items).toBeDefined();
    expect(schema.properties.tags!.items!.type).toBe('string');
    expect(schema.properties.tags!.items!.options).toHaveLength(2);
  });

  it('converts resourceLocator to string type', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'resourceLocator',
        default: '',
      },
    ] as any);

    expect(schema.properties.resource!.type).toBe('string');
  });

  it('handles password typeOption with format password', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Secret',
        name: 'secret',
        type: 'string',
        default: '',
        typeOptions: { password: true },
      },
    ] as any);

    expect(schema.properties.secret!.type).toBe('string');
    expect(schema.properties.secret!.format).toBe('password');
  });

  it('handles rows typeOption', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        default: '',
        typeOptions: { rows: 5 },
      },
    ] as any);

    expect(schema.properties.body!.rows).toBe(5);
  });

  it('collects required fields into schema.required', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        default: '',
        required: true,
      },
      {
        displayName: 'Method',
        name: 'method',
        type: 'string',
        default: 'GET',
      },
    ] as any);

    expect(schema.required).toBeDefined();
    expect(schema.required).toContain('url');
    expect(schema.required).not.toContain('method');
  });
});

describe('convertN8nPropertiesToSchema - displayOptions (allOf)', () => {
  it('moves properties with displayOptions.show into allOf', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
        ],
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        default: '',
        displayOptions: {
          show: { method: ['POST', 'PUT'] },
        },
      },
    ] as any);

    // method should be a static property
    expect(schema.properties.method).toBeDefined();
    // body should NOT be a static property
    expect(schema.properties.body).toBeUndefined();
    // body should be in allOf
    expect(schema.allOf).toBeDefined();
    expect(schema.allOf).toHaveLength(1);

    const rule: ConditionalRule = schema.allOf![0]!;
    expect(rule.if.properties.method).toEqual({ enum: ['POST', 'PUT'] });
    expect(rule.then.properties.body).toBeDefined();
    expect(rule.then.properties.body!.type).toBe('string');
  });

  it('moves properties with displayOptions.hide into allOf with not', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
        ],
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        default: '',
        displayOptions: {
          hide: { method: ['GET'] },
        },
      },
    ] as any);

    expect(schema.allOf).toBeDefined();
    expect(schema.allOf).toHaveLength(1);

    const rule = schema.allOf![0]!;
    expect(rule.if.properties.method).toEqual({ not: { enum: ['GET'] } });
    expect(rule.then.properties.body).toBeDefined();
  });

  it('groups properties with the same displayOptions into one allOf entry', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
        ],
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        default: '',
        displayOptions: {
          show: { method: ['POST'] },
        },
      },
      {
        displayName: 'Content-Type',
        name: 'contentType',
        type: 'string',
        default: 'application/json',
        displayOptions: {
          show: { method: ['POST'] },
        },
      },
    ] as any);

    // Two conditional properties share the same condition => 1 allOf entry
    expect(schema.allOf).toHaveLength(1);
    const rule = schema.allOf![0]!;
    expect(rule.then.properties.body).toBeDefined();
    expect(rule.then.properties.contentType).toBeDefined();
  });

  it('creates separate allOf entries for different displayOptions', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
        ],
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        default: '',
        displayOptions: {
          show: { method: ['POST'] },
        },
      },
      {
        displayName: 'Resource ID',
        name: 'resourceId',
        type: 'string',
        default: '',
        displayOptions: {
          show: { method: ['PUT'] },
        },
      },
    ] as any);

    expect(schema.allOf).toHaveLength(2);
  });

  it('includes required fields in conditional then.required', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
        ],
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: { method: ['POST'] },
        },
      },
    ] as any);

    expect(schema.allOf).toHaveLength(1);
    expect(schema.allOf![0]!.then.required).toContain('body');
  });

  it('ignores @version and @feature meta-keys in displayOptions', () => {
    const schema = convertN8nPropertiesToSchema([
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        default: '',
        displayOptions: {
          show: { '@version': [2] },
        },
      },
    ] as any);

    // @version-only displayOptions is treated as unconditional
    expect(schema.properties.name).toBeDefined();
    expect(schema.allOf).toBeUndefined();
  });
});

describe('buildNodePalette (integration with n8n-nodes-base)', () => {
  let nodeTypes: R360NodeTypes;
  let testUserFolder: string;

  beforeAll(async () => {
    testUserFolder = mkdtempSync(
      path.join(tmpdir(), 'r360-node-palette-test-')
    );

    resetBootstrap();
    await bootstrapN8nContainer({
      encryptionKey: TEST_ENCRYPTION_KEY,
      userFolder: testUserFolder,
    });

    nodeTypes = new R360NodeTypes();
    await nodeTypes.init();
  }, 60000);

  afterAll(() => {
    try {
      rmSync(testUserFolder, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  it('returns 50+ items from n8n-nodes-base', () => {
    const palette = buildNodePalette(nodeTypes);

    expect(Array.isArray(palette)).toBe(true);
    expect(palette.length).toBeGreaterThan(50);
  });

  it('includes well-known nodes like HTTP Request', () => {
    const palette = buildNodePalette(nodeTypes);
    const httpNode = palette.find(
      (item) => item.type === 'httpRequest'
    );

    expect(httpNode).toBeDefined();
    expect(httpNode!.label).toBe('HTTP Request');
    expect(httpNode!.schema).toBeDefined();
    expect(httpNode!.schema.properties).toBeDefined();
  });

  it('filters by category', () => {
    const allItems = buildNodePalette(nodeTypes);
    const categories = [...new Set(allItems.map((i) => i.category))];

    // Pick a category that has items
    const testCategory = categories.find(
      (c) => allItems.filter((i) => i.category === c).length > 1
    );
    expect(testCategory).toBeDefined();

    const filtered = buildNodePalette(nodeTypes, {
      category: testCategory!,
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(allItems.length);
    expect(
      filtered.every(
        (item) =>
          item.category.toLowerCase() === testCategory!.toLowerCase() ||
          item.templateType === testCategory!.toLowerCase()
      )
    ).toBe(true);
  });

  it('filters by search query', () => {
    const allItems = buildNodePalette(nodeTypes);
    const filtered = buildNodePalette(nodeTypes, { search: 'http' });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(allItems.length);
    expect(
      filtered.every(
        (item) =>
          item.label.toLowerCase().includes('http') ||
          item.description.toLowerCase().includes('http') ||
          item.type.toLowerCase().includes('http')
      )
    ).toBe(true);
  });

  it('filters by both category and search', () => {
    // Use a broad search to ensure we get results
    const filtered = buildNodePalette(nodeTypes, {
      category: 'Development',
      search: 'http',
    });

    // Should have fewer results than either filter alone
    const categoryOnly = buildNodePalette(nodeTypes, {
      category: 'Development',
    });
    const searchOnly = buildNodePalette(nodeTypes, { search: 'http' });

    expect(filtered.length).toBeLessThanOrEqual(categoryOnly.length);
    expect(filtered.length).toBeLessThanOrEqual(searchOnly.length);
  });

  it('each palette item has the expected shape', () => {
    const palette = buildNodePalette(nodeTypes);
    const sampleItem = palette[0]!;

    expect(sampleItem).toHaveProperty('type');
    expect(sampleItem).toHaveProperty('label');
    expect(sampleItem).toHaveProperty('description');
    expect(sampleItem).toHaveProperty('icon');
    expect(sampleItem).toHaveProperty('templateType');
    expect(sampleItem).toHaveProperty('schema');
    expect(sampleItem).toHaveProperty('schema.properties');
    expect(sampleItem).toHaveProperty('defaultPropertiesData');
    expect(sampleItem).toHaveProperty('category');
    expect(['trigger', 'action', 'conditional', 'default']).toContain(
      sampleItem.templateType
    );
  });

  it('enriched schema includes descriptions on fields', () => {
    const palette = buildNodePalette(nodeTypes);
    // Find a node that has properties with descriptions
    const nodeWithProps = palette.find(
      (item) => Object.keys(item.schema.properties).length > 3
    );
    expect(nodeWithProps).toBeDefined();

    // At least some fields should have descriptions
    const fields = Object.values(nodeWithProps!.schema.properties);
    const fieldsWithDesc = fields.filter((f) => f.description);
    expect(fieldsWithDesc.length).toBeGreaterThan(0);
  });

  it('enriched schema uses allOf for conditional properties', () => {
    const palette = buildNodePalette(nodeTypes);
    // Find a node that has conditional properties (allOf)
    const nodeWithAllOf = palette.find(
      (item) => item.schema.allOf && item.schema.allOf.length > 0
    );
    expect(nodeWithAllOf).toBeDefined();

    const firstRule = nodeWithAllOf!.schema.allOf![0]!;
    expect(firstRule.if).toBeDefined();
    expect(firstRule.if.properties).toBeDefined();
    expect(firstRule.then).toBeDefined();
    expect(firstRule.then.properties).toBeDefined();
  });
});
