import type {
  INodeTypeDescription,
  INodeProperties,
  INodePropertyCollection,
  INodePropertyOptions,
  INodeCredentialDescription,
} from 'n8n-workflow';

import type { R360NodeTypes } from './node-types';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

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
  credentials?: CredentialRef[];
}

export interface CredentialRef {
  name: string;
  required?: boolean;
  displayName?: string;
}

export interface NodeSchema {
  properties: NodePropertiesSchema;
  required?: string[];
  allOf?: ConditionalRule[];
}

/**
 * A single JSON-Schema-style if/then rule derived from n8n displayOptions.
 */
export interface ConditionalRule {
  if: {
    properties: {
      [key: string]: { enum?: unknown[] } | { not: { enum: unknown[] } };
    };
  };
  then: {
    properties: NodePropertiesSchema;
    required?: string[];
  };
}

export interface NodePropertiesSchema {
  [key: string]: FieldSchema;
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  label?: string;
  description?: string;
  placeholder?: string;
  hint?: string;
  options?: Array<{ label: string; value: string; description?: string }>;
  properties?: NodePropertiesSchema;
  items?: FieldSchema;
  format?: string;
  minimum?: number;
  maximum?: number;
  rows?: number;
  multipleValues?: boolean;
  credentialTypes?: string[];
}

export interface PaletteFilterOptions {
  category?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Main entry: convert a node description to a palette item
// ---------------------------------------------------------------------------

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

  // Convert credentials
  const credentials = convertCredentials(desc.credentials);

  const item: N8nPaletteItem = {
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

  if (credentials && credentials.length > 0) {
    item.credentials = credentials;
  }

  return item;
}

// ---------------------------------------------------------------------------
// Schema conversion: n8n INodeProperties[] -> NodeSchema
// ---------------------------------------------------------------------------

/**
 * Convert n8n INodeProperties[] to NodeSchema.
 *
 * Properties WITHOUT displayOptions go into schema.properties directly.
 * Properties WITH displayOptions go into schema.allOf as if-then rules.
 * Required fields are collected into schema.required.
 */
export function convertN8nPropertiesToSchema(
  properties: INodeProperties[]
): NodeSchema {
  // Always include label + description as base properties
  const staticProperties: NodePropertiesSchema = {
    label: { type: 'string' },
    description: { type: 'string' },
  };
  const staticRequired: string[] = [];

  // Group conditional properties by their displayOptions signature
  const conditionGroups = new Map<string, {
    condition: ConditionalRule['if'];
    properties: NodePropertiesSchema;
    required: string[];
  }>();

  for (const prop of properties) {
    // Skip notice/callout types -- they are UI hints, not data fields
    if (prop.type === 'notice' || prop.type === 'callout') {
      continue;
    }

    const fieldSchema = convertPropertyToField(prop);
    if (!fieldSchema) {
      continue;
    }

    if (prop.displayOptions && hasShowOrHide(prop.displayOptions)) {
      // Build an if-condition from displayOptions
      const conditionKey = buildConditionKey(prop.displayOptions);
      const ifCondition = buildIfCondition(prop.displayOptions);

      let group = conditionGroups.get(conditionKey);
      if (!group) {
        group = { condition: ifCondition, properties: {}, required: [] };
        conditionGroups.set(conditionKey, group);
      }
      group.properties[prop.name] = fieldSchema;
      if (prop.required) {
        group.required.push(prop.name);
      }
    } else {
      // Static (unconditional) property
      staticProperties[prop.name] = fieldSchema;
      if (prop.required) {
        staticRequired.push(prop.name);
      }
    }
  }

  const schema: NodeSchema = {
    properties: staticProperties,
  };

  if (staticRequired.length > 0) {
    schema.required = staticRequired;
  }

  if (conditionGroups.size > 0) {
    schema.allOf = [];
    for (const group of conditionGroups.values()) {
      const rule: ConditionalRule = {
        if: group.condition,
        then: {
          properties: group.properties,
        },
      };
      if (group.required.length > 0) {
        rule.then.required = group.required;
      }
      schema.allOf.push(rule);
    }
  }

  return schema;
}

// ---------------------------------------------------------------------------
// Property -> FieldSchema conversion
// ---------------------------------------------------------------------------

function convertPropertyToField(prop: INodeProperties): FieldSchema | null {
  const base: Partial<FieldSchema> = {
    label: prop.displayName,
  };

  if (prop.description) {
    base.description = prop.description;
  }
  if (prop.placeholder) {
    base.placeholder = String(prop.placeholder);
  }
  if (prop.hint) {
    base.hint = prop.hint;
  }

  // Apply typeOptions
  if (prop.typeOptions?.password) {
    base.format = 'password';
  }
  if (prop.typeOptions?.rows) {
    base.rows = prop.typeOptions.rows;
  }
  if (prop.typeOptions?.multipleValues) {
    base.multipleValues = true;
  }

  switch (prop.type) {
    case 'string':
      return { ...base, type: 'string' } as FieldSchema;

    case 'number': {
      const field: FieldSchema = { ...base, type: 'number' } as FieldSchema;
      if (prop.typeOptions?.minValue !== undefined) {
        field.minimum = prop.typeOptions.minValue;
      }
      if (prop.typeOptions?.maxValue !== undefined) {
        field.maximum = prop.typeOptions.maxValue;
      }
      return field;
    }

    case 'boolean':
      return { ...base, type: 'boolean' } as FieldSchema;

    case 'options':
      return {
        ...base,
        type: 'string',
        options: convertOptions(prop.options),
      } as FieldSchema;

    case 'multiOptions':
      return {
        ...base,
        type: 'array',
        items: {
          type: 'string',
          options: convertOptions(prop.options),
        },
      } as FieldSchema;

    case 'collection':
      return {
        ...base,
        type: 'object',
        properties: convertCollectionOptions(prop.options),
      } as FieldSchema;

    case 'fixedCollection':
      return {
        ...base,
        type: 'object',
        properties: convertFixedCollectionOptions(prop.options),
      } as FieldSchema;

    case 'json':
      return { ...base, type: 'string', format: 'json' } as FieldSchema;

    case 'dateTime':
      return { ...base, type: 'string', format: 'date-time' } as FieldSchema;

    case 'color':
      return { ...base, type: 'string', format: 'color' } as FieldSchema;

    case 'notice':
    case 'callout':
      // UI hint types -- skip
      return null;

    case 'resourceLocator':
      return { ...base, type: 'string' } as FieldSchema;

    case 'resourceMapper':
    case 'filter':
    case 'assignmentCollection':
      return { ...base, type: 'object' } as FieldSchema;

    case 'hidden':
    case 'button':
    case 'icon':
    case 'curlImport':
    case 'workflowSelector':
    case 'credentials':
      // Non-data or special UI types -- fall back to string
      return { ...base, type: 'string' } as FieldSchema;

    case 'credentialsSelect':
      return {
        ...base,
        type: 'string',
        format: 'credentialsSelect',
        credentialTypes: (prop as any).credentialTypes ?? [],
      } as FieldSchema;

    default:
      // Unknown type -- fall back to string
      return { ...base, type: 'string' } as FieldSchema;
  }
}

// ---------------------------------------------------------------------------
// Options helpers
// ---------------------------------------------------------------------------

function convertOptions(
  options?: Array<INodePropertyOptions | INodeProperties | INodePropertyCollection>
): Array<{ label: string; value: string; description?: string }> {
  if (!options) return [];
  return options
    .filter((o): o is INodePropertyOptions => 'value' in o)
    .map((o) => {
      const item: { label: string; value: string; description?: string } = {
        label: o.name,
        value: String(o.value),
      };
      if (o.description) {
        item.description = o.description;
      }
      return item;
    });
}

/**
 * Convert a collection's options into nested properties.
 * In n8n, collection options are INodeProperties[], each representing
 * a sub-field the user can toggle on.
 */
function convertCollectionOptions(
  options?: Array<INodePropertyOptions | INodeProperties | INodePropertyCollection>
): NodePropertiesSchema {
  if (!options) return {};
  const props: NodePropertiesSchema = {};
  for (const opt of options) {
    if (isNodeProperties(opt)) {
      const field = convertPropertyToField(opt);
      if (field) {
        props[opt.name] = field;
      }
    }
  }
  return props;
}

/**
 * Convert a fixedCollection's options into nested properties.
 * In n8n, fixedCollection options are INodePropertyCollection[],
 * each with a `values: INodeProperties[]` array.
 */
function convertFixedCollectionOptions(
  options?: Array<INodePropertyOptions | INodeProperties | INodePropertyCollection>
): NodePropertiesSchema {
  if (!options) return {};
  const props: NodePropertiesSchema = {};
  for (const opt of options) {
    if (isNodePropertyCollection(opt)) {
      const innerProps: NodePropertiesSchema = {};
      for (const innerProp of opt.values) {
        const field = convertPropertyToField(innerProp);
        if (field) {
          innerProps[innerProp.name] = field;
        }
      }
      props[opt.name] = {
        type: 'object',
        label: opt.displayName,
        properties: innerProps,
      };
    }
  }
  return props;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isNodeProperties(
  opt: INodePropertyOptions | INodeProperties | INodePropertyCollection
): opt is INodeProperties {
  return 'type' in opt && !('values' in opt);
}

function isNodePropertyCollection(
  opt: INodePropertyOptions | INodeProperties | INodePropertyCollection
): opt is INodePropertyCollection {
  return 'values' in opt && Array.isArray((opt as INodePropertyCollection).values);
}

// ---------------------------------------------------------------------------
// displayOptions -> if/then condition helpers
// ---------------------------------------------------------------------------

interface DisplayOptionsLike {
  show?: Record<string, unknown[] | undefined>;
  hide?: Record<string, unknown[] | undefined>;
}

function hasShowOrHide(displayOptions: DisplayOptionsLike): boolean {
  const showKeys = displayOptions.show ? Object.keys(displayOptions.show) : [];
  const hideKeys = displayOptions.hide ? Object.keys(displayOptions.hide) : [];
  // Filter out meta-keys like @version, @feature, @tool
  const realShowKeys = showKeys.filter((k) => !k.startsWith('@'));
  const realHideKeys = hideKeys.filter((k) => !k.startsWith('@'));
  return realShowKeys.length > 0 || realHideKeys.length > 0;
}

/**
 * Build a deterministic string key for grouping properties with the same
 * displayOptions condition. Properties sharing the same condition key
 * get merged into a single allOf entry.
 */
function buildConditionKey(displayOptions: DisplayOptionsLike): string {
  const parts: string[] = [];
  if (displayOptions.show) {
    for (const [key, values] of Object.entries(displayOptions.show)) {
      if (key.startsWith('@') || !values) continue;
      parts.push(`show:${key}=${JSON.stringify(values.slice().sort())}`);
    }
  }
  if (displayOptions.hide) {
    for (const [key, values] of Object.entries(displayOptions.hide)) {
      if (key.startsWith('@') || !values) continue;
      parts.push(`hide:${key}=${JSON.stringify(values.slice().sort())}`);
    }
  }
  return parts.sort().join('|');
}

/**
 * Convert displayOptions.show / displayOptions.hide to a JSON-Schema-style
 * `if` condition object.
 *
 * show: { method: ['POST', 'PUT'] }
 *   -> { properties: { method: { enum: ['POST', 'PUT'] } } }
 *
 * hide: { method: ['GET'] }
 *   -> { properties: { method: { not: { enum: ['GET'] } } } }
 */
function buildIfCondition(displayOptions: DisplayOptionsLike): ConditionalRule['if'] {
  const ifProperties: ConditionalRule['if']['properties'] = {};

  if (displayOptions.show) {
    for (const [key, values] of Object.entries(displayOptions.show)) {
      if (key.startsWith('@') || !values) continue;
      // Extract primitive values (n8n DisplayCondition objects are ignored for schema purposes)
      const primitiveValues = values.filter(
        (v) => typeof v !== 'object' || v === null
      );
      if (primitiveValues.length > 0) {
        ifProperties[key] = { enum: primitiveValues };
      }
    }
  }

  if (displayOptions.hide) {
    for (const [key, values] of Object.entries(displayOptions.hide)) {
      if (key.startsWith('@') || !values) continue;
      const primitiveValues = values.filter(
        (v) => typeof v !== 'object' || v === null
      );
      if (primitiveValues.length > 0) {
        ifProperties[key] = { not: { enum: primitiveValues } };
      }
    }
  }

  return { properties: ifProperties };
}

// ---------------------------------------------------------------------------
// Credentials helper
// ---------------------------------------------------------------------------

function convertCredentials(
  credentials?: INodeCredentialDescription[]
): CredentialRef[] | undefined {
  if (!credentials || credentials.length === 0) return undefined;
  return credentials.map((cred) => {
    const ref: CredentialRef = { name: cred.name };
    if (cred.required !== undefined) {
      ref.required = cred.required;
    }
    if (cred.displayName) {
      ref.displayName = cred.displayName;
    }
    return ref;
  });
}

// ---------------------------------------------------------------------------
// Defaults & icon helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Full palette builder
// ---------------------------------------------------------------------------

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
