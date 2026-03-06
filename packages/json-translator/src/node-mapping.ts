import type { INode, INodeParameters, NodeParameterValue } from './types.js';
import type { WorkflowBuilderNode } from './wb-types.js';

/**
 * Properties that are metadata (not n8n node parameters).
 * These are stripped from the properties object before creating INodeParameters.
 */
export const META_PROPERTIES = new Set([
  'label',
  'description',
  'typeVersion',
  'disabled',
  'notes',
  'notesInFlow',
  'retryOnFail',
  'maxTries',
  'waitBetweenTries',
  'continueOnFail',
  'onError',
  'credentials',
  'color',
  'icon',
]);

/**
 * Known n8n node type to default display-name map.
 * Used when a WB node has no label.
 */
export const NODE_TYPE_DISPLAY_NAMES: Record<string, string> = {
  'n8n-nodes-base.manualTrigger': 'Manual Trigger',
  'n8n-nodes-base.httpRequest': 'HTTP Request',
  'n8n-nodes-base.set': 'Edit Fields',
  'n8n-nodes-base.code': 'Code',
  'n8n-nodes-base.if': 'If',
  'n8n-nodes-base.switch': 'Switch',
  'n8n-nodes-base.merge': 'Merge',
  'n8n-nodes-base.noOp': 'No Operation',
  'n8n-nodes-base.webhook': 'Webhook',
  'n8n-nodes-base.scheduleTrigger': 'Schedule Trigger',
  'n8n-nodes-base.slack': 'Slack',
  'n8n-nodes-base.gmail': 'Gmail',
  'n8n-nodes-base.googleSheets': 'Google Sheets',
};

/**
 * Resolve a human-readable node name from a WorkflowBuilderNode.
 *
 * Priority:
 *  1. The `label` property if present and non-empty
 *  2. A known display name from NODE_TYPE_DISPLAY_NAMES
 *  3. Derived from the type string by splitting camelCase
 *     e.g. "n8n-nodes-base.httpRequest" -> "http Request"
 */
function resolveNodeName(wbNode: WorkflowBuilderNode): string {
  const label = wbNode.data.properties.label;
  if (typeof label === 'string' && label.trim().length > 0) {
    return label.trim();
  }

  const n8nType = wbNode.data.type;
  if (NODE_TYPE_DISPLAY_NAMES[n8nType]) {
    return NODE_TYPE_DISPLAY_NAMES[n8nType];
  }

  // Derive from type string: "n8n-nodes-base.httpRequest" -> "http Request"
  const shortType = n8nType.includes('.') ? n8nType.split('.').pop()! : n8nType;
  return shortType.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Extract execution parameters from the WB node properties,
 * filtering out metadata properties that map to INode top-level fields.
 */
function extractParameters(properties: Record<string, unknown>): INodeParameters {
  const params: INodeParameters = {};
  for (const [key, value] of Object.entries(properties)) {
    if (META_PROPERTIES.has(key)) continue;
    params[key] = value as NodeParameterValue;
  }
  return params;
}

/**
 * Convert a WorkflowBuilderNode to an n8n INode.
 *
 * - Position is converted from {x, y} object to [x, y] tuple
 * - The n8n type is taken from data.type
 * - Label becomes the node name
 * - Properties are split into metadata (INode top-level fields) and parameters
 * - typeVersion defaults to 1 if not specified
 */
export function mapWBNodeToN8nNode(wbNode: WorkflowBuilderNode): INode {
  const props = wbNode.data.properties;

  const node: INode = {
    id: wbNode.id,
    name: resolveNodeName(wbNode),
    type: wbNode.data.type,
    typeVersion: typeof props.typeVersion === 'number' ? props.typeVersion : 1,
    position: [wbNode.position.x, wbNode.position.y],
    parameters: extractParameters(props),
  };

  // Optional meta fields -- set on INode only when present
  if (props.disabled === true) node.disabled = true;
  if (typeof props.notes === 'string') node.notes = props.notes;
  if (props.notesInFlow === true) node.notesInFlow = true;
  if (props.continueOnFail === true) node.continueOnFail = true;
  if (typeof props.onError === 'string') {
    node.onError = props.onError as INode['onError'];
  }
  if (props.retryOnFail === true) node.retryOnFail = true;
  if (typeof props.maxTries === 'number') node.maxTries = props.maxTries;
  if (typeof props.waitBetweenTries === 'number') node.waitBetweenTries = props.waitBetweenTries;
  if (props.credentials && typeof props.credentials === 'object') {
    node.credentials = props.credentials as Record<string, { id: string; name: string }>;
  }

  return node;
}

/**
 * Build a map from node ID -> unique node name.
 * n8n requires unique node names within a workflow.
 * Duplicate names get a numeric suffix: "Set", "Set 1", "Set 2", etc.
 */
export function buildNodeNameMap(nodes: WorkflowBuilderNode[]): Map<string, string> {
  const nameMap = new Map<string, string>();
  const nameCounts = new Map<string, number>();

  for (const node of nodes) {
    const baseName = resolveNodeName(node);
    const count = nameCounts.get(baseName) ?? 0;

    if (count === 0) {
      nameMap.set(node.id, baseName);
    } else {
      nameMap.set(node.id, `${baseName} ${count}`);
    }

    nameCounts.set(baseName, count + 1);
  }

  return nameMap;
}
