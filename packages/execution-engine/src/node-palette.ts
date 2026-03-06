import type {
  INodeTypeDescription,
  INodeProperties,
} from 'n8n-workflow';

import type { R360NodeTypes } from './node-types.js';

/**
 * Simplified PaletteItem type for our API response.
 * Full type integration with Workflow Builder happens at the frontend layer.
 */
export interface N8nPaletteItem {
  type: string;
  label: string;
  description: string;
  icon: string;
  templateType: 'trigger' | 'action' | 'conditional' | 'default';
  schema: NodeSchema;
  defaultPropertiesData: Record<string, unknown>;
  category: string;
}

export interface NodeSchema {
  properties: NodePropertiesSchema;
}

export interface NodePropertiesSchema {
  [key: string]: FieldSchema;
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object';
  label?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  properties?: NodePropertiesSchema;
}

export interface PaletteFilterOptions {
  category?: string;
  search?: string;
}

/**
 * Convert a single n8n INodeTypeDescription to a PaletteItem-compatible object.
 */
export function convertToPaletteItem(
  desc: INodeTypeDescription
): N8nPaletteItem {
  const isTrigger =
    desc.group?.includes('trigger') ||
    desc.name.toLowerCase().includes('trigger') ||
    desc.name.toLowerCase().includes('webhook');

  const templateType: N8nPaletteItem['templateType'] = isTrigger ? 'trigger' : 'action';

  const schema = convertN8nPropertiesToSchema(desc.properties || []);
  const defaults = buildDefaults(desc.properties || [], desc.defaults);

  // Map n8n icon format to a string identifier
  const icon = resolveIcon(desc);

  // Determine category from codex or group
  const category = desc.codex?.categories?.[0] || desc.group?.[0] || 'other';

  return {
    type: desc.name,
    label: desc.displayName,
    description: desc.description,
    icon,
    templateType,
    schema,
    defaultPropertiesData: {
      label: desc.displayName,
      description: desc.description,
      ...defaults,
    },
    category,
  };
}

/**
 * Convert n8n INodeProperties[] to NodeSchema.
 */
export function convertN8nPropertiesToSchema(
  properties: INodeProperties[]
): NodeSchema {
  const schemaProperties: NodePropertiesSchema = {
    label: { type: 'string' },
    description: { type: 'string' },
  };

  for (const prop of properties) {
    const fieldSchema = convertPropertyToField(prop);
    if (fieldSchema) {
      schemaProperties[prop.name] = fieldSchema;
    }
  }

  return { properties: schemaProperties };
}

function convertPropertyToField(prop: INodeProperties): FieldSchema | null {
  switch (prop.type) {
    case 'string':
      return {
        type: 'string',
        label: prop.displayName,
        placeholder: prop.placeholder as string | undefined,
      };
    case 'number':
      return {
        type: 'number',
        label: prop.displayName,
      };
    case 'boolean':
      return {
        type: 'boolean',
        label: prop.displayName,
      };
    case 'options':
      return {
        type: 'string',
        label: prop.displayName,
        options: (prop.options || [])
          .filter((o): o is { name: string; value: string } => 'value' in o)
          .map((o) => ({
            label: o.name,
            value: String(o.value),
          })),
      };
    case 'collection':
    case 'fixedCollection':
      return {
        type: 'object',
        label: prop.displayName,
        properties: {},
      };
    default:
      // For complex types, fall back to string
      return {
        type: 'string',
        label: prop.displayName,
      };
  }
}

function buildDefaults(
  properties: INodeProperties[],
  nodeDefaults?: Record<string, unknown>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const prop of properties) {
    if (prop.default !== undefined) {
      defaults[prop.name] = prop.default;
    }
  }
  return { ...defaults, ...nodeDefaults };
}

function resolveIcon(desc: INodeTypeDescription): string {
  if (typeof desc.icon === 'string') {
    return desc.icon;
  }
  return 'default-node-icon';
}

/**
 * Build the full node palette from all available node types.
 */
export function buildNodePalette(
  nodeTypes: R360NodeTypes,
  filters?: PaletteFilterOptions
): N8nPaletteItem[] {
  const descriptions = nodeTypes.getNodeTypeDescriptions();
  let items = descriptions.map(convertToPaletteItem);

  if (filters?.category) {
    const cat = filters.category.toLowerCase();
    items = items.filter(
      (item) =>
        item.category.toLowerCase() === cat ||
        item.templateType === cat
    );
  }

  if (filters?.search) {
    const search = filters.search.toLowerCase();
    items = items.filter(
      (item) =>
        item.label.toLowerCase().includes(search) ||
        item.description.toLowerCase().includes(search) ||
        item.type.toLowerCase().includes(search)
    );
  }

  return items;
}
