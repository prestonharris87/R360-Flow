import { describe, it, expect } from 'vitest';
import {
  mapWBPropertiesToN8nParameters,
  mapN8nParametersToWBProperties,
  META_PROPERTY_KEYS,
} from '../parameter-mapping';

describe('mapWBPropertiesToN8nParameters', () => {
  it('passes through primitive values unchanged', () => {
    const properties = {
      url: 'https://api.example.com',
      method: 'GET',
      timeout: 30000,
      followRedirects: true,
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params).toEqual({
      url: 'https://api.example.com',
      method: 'GET',
      timeout: 30000,
      followRedirects: true,
    });
  });

  it('strips metadata properties (label, description, typeVersion, disabled, etc.)', () => {
    const properties = {
      label: 'My Node',
      description: 'Does things',
      typeVersion: 2,
      disabled: false,
      notes: 'Some notes',
      notesInFlow: true,
      continueOnFail: false,
      onError: 'stopWorkflow',
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000,
      credentials: { httpBasicAuth: { id: '1', name: 'My Creds' } },
      color: '#ff0000',
      icon: 'fa:globe',
      url: 'https://example.com',
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params).toEqual({ url: 'https://example.com' });

    // Verify every meta key is stripped
    for (const key of META_PROPERTY_KEYS) {
      expect(params).not.toHaveProperty(key);
    }
  });

  it('preserves nested objects (collections, fixedCollections)', () => {
    const properties = {
      label: 'Set Fields',
      assignments: {
        assignments: [
          { name: 'email', value: 'test@example.com', type: 'string' },
          { name: 'age', value: 25, type: 'number' },
        ],
      },
      options: {
        dotNotation: true,
        ignoreEmpty: false,
      },
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params.assignments).toEqual({
      assignments: [
        { name: 'email', value: 'test@example.com', type: 'string' },
        { name: 'age', value: 25, type: 'number' },
      ],
    });
    expect(params.options).toEqual({
      dotNotation: true,
      ignoreEmpty: false,
    });
  });

  it('preserves arrays at the top level', () => {
    const properties = {
      items: [1, 2, 3],
      tags: ['alpha', 'beta'],
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params.items).toEqual([1, 2, 3]);
    expect(params.tags).toEqual(['alpha', 'beta']);
  });

  it('preserves expression syntax strings unmodified', () => {
    const properties = {
      label: 'Dynamic Node',
      value: '={{ $json.name }}',
      url: '={{ $json.apiUrl }}/endpoint',
      complex: '={{ $items("Previous Node").first().json.id }}',
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params.value).toBe('={{ $json.name }}');
    expect(params.url).toBe('={{ $json.apiUrl }}/endpoint');
    expect(params.complex).toBe('={{ $items("Previous Node").first().json.id }}');
    expect(params).not.toHaveProperty('label');
  });

  it('handles empty properties', () => {
    const params = mapWBPropertiesToN8nParameters({});
    expect(params).toEqual({});
  });

  it('returns empty object for undefined input', () => {
    const params = mapWBPropertiesToN8nParameters(undefined);
    expect(params).toEqual({});
  });

  it('returns empty object for null input', () => {
    const params = mapWBPropertiesToN8nParameters(null);
    expect(params).toEqual({});
  });
});

describe('mapN8nParametersToWBProperties', () => {
  it('passes through n8n parameters as WB properties', () => {
    const params = {
      url: 'https://api.example.com',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    const properties = mapN8nParametersToWBProperties(params, 'HTTP Request');

    expect(properties.label).toBe('HTTP Request');
    expect(properties.url).toBe('https://api.example.com');
    expect(properties.method).toBe('POST');
    expect(properties.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('re-adds label from nodeName', () => {
    const params = { resource: 'contact' };

    const properties = mapN8nParametersToWBProperties(params, 'CRM Node');

    expect(properties.label).toBe('CRM Node');
    expect(properties.resource).toBe('contact');
  });

  it('re-adds description from nodeNotes', () => {
    const params = { action: 'create' };

    const properties = mapN8nParametersToWBProperties(params, 'My Node', 'This creates a record');

    expect(properties.label).toBe('My Node');
    expect(properties.description).toBe('This creates a record');
    expect(properties.action).toBe('create');
  });

  it('does not add label when nodeName is not provided', () => {
    const params = { key: 'value' };

    const properties = mapN8nParametersToWBProperties(params);

    expect(properties).not.toHaveProperty('label');
    expect(properties.key).toBe('value');
  });

  it('does not add description when nodeNotes is not provided', () => {
    const params = { key: 'value' };

    const properties = mapN8nParametersToWBProperties(params, 'Node Name');

    expect(properties).not.toHaveProperty('description');
    expect(properties.label).toBe('Node Name');
  });

  it('preserves expression syntax strings unmodified in reverse mapping', () => {
    const params = {
      value: '={{ $json.name }}',
      url: '={{ $json.apiUrl }}/endpoint',
    };

    const properties = mapN8nParametersToWBProperties(params, 'Expr Node');

    expect(properties.value).toBe('={{ $json.name }}');
    expect(properties.url).toBe('={{ $json.apiUrl }}/endpoint');
  });

  it('returns empty object for undefined input with no name', () => {
    const properties = mapN8nParametersToWBProperties(undefined);
    expect(properties).toEqual({});
  });

  it('returns object with only label for null input with name', () => {
    const properties = mapN8nParametersToWBProperties(null, 'Node');
    expect(properties).toEqual({ label: 'Node' });
  });

  it('returns empty object for empty parameters with no name', () => {
    const properties = mapN8nParametersToWBProperties({});
    expect(properties).toEqual({});
  });
});
