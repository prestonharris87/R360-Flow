import type { IConnections, INode, NodeInputConnections } from './types.js';
import type { WorkflowBuilderEdge, WorkflowBuilderNode } from './wb-types.js';
import { mapN8nParametersToWBProperties } from './parameter-mapping.js';

/**
 * Node types that represent trigger/start nodes in the WB visual editor.
 * Both exact matches and a fallback heuristic (type includes "trigger") are used.
 */
export const TRIGGER_TYPES = new Set([
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.emailTrigger',
  'n8n-nodes-base.cron',
]);

/**
 * Node types that represent decision/branching nodes in the WB visual editor.
 */
export const DECISION_TYPES = new Set([
  'n8n-nodes-base.if',
  'n8n-nodes-base.switch',
]);

/**
 * Map n8n node type to a Workflow Builder icon name.
 * Used to display an appropriate icon in the visual editor.
 */
export const NODE_TYPE_ICONS: Record<string, string> = {
  'n8n-nodes-base.manualTrigger': 'PlayCircle',
  'n8n-nodes-base.webhook': 'Webhook',
  'n8n-nodes-base.scheduleTrigger': 'Clock',
  'n8n-nodes-base.httpRequest': 'Globe',
  'n8n-nodes-base.set': 'PenTool',
  'n8n-nodes-base.if': 'GitBranch',
  'n8n-nodes-base.switch': 'GitBranch',
  'n8n-nodes-base.code': 'Code',
  'n8n-nodes-base.merge': 'GitMerge',
  'n8n-nodes-base.noOp': 'Minus',
  'n8n-nodes-base.slack': 'MessageSquare',
  'n8n-nodes-base.gmail': 'Mail',
  'n8n-nodes-base.googleSheets': 'Table',
};

/**
 * Check whether an n8n node type represents a trigger node.
 * Uses the TRIGGER_TYPES set plus a heuristic: any type containing "trigger"
 * (case-insensitive) is treated as a trigger.
 */
function isTriggerNode(type: string): boolean {
  return TRIGGER_TYPES.has(type) || type.toLowerCase().includes('trigger');
}

/**
 * Resolve the Workflow Builder icon name for a given n8n node type.
 * Falls back to 'Box' for unknown types.
 */
export function resolveIcon(n8nType: string): string {
  return NODE_TYPE_ICONS[n8nType] ?? 'Box';
}

/**
 * Resolve the Workflow Builder node type for a given n8n node type.
 *
 * - Trigger nodes -> 'start-node'
 * - Decision nodes (if, switch) -> 'decision-node'
 * - Everything else -> 'node'
 */
export function resolveWBNodeType(n8nType: string): string {
  if (isTriggerNode(n8nType)) return 'start-node';
  if (DECISION_TYPES.has(n8nType)) return 'decision-node';
  return 'node';
}

/**
 * Convert an n8n INode to a WorkflowBuilderNode.
 *
 * - Position [x, y] tuple is converted to { x, y } object
 * - The WB node type is determined from the n8n type (trigger/decision/regular)
 * - Icon is resolved from NODE_TYPE_ICONS with 'Box' fallback
 * - n8n parameters are mapped to WB properties via mapN8nParametersToWBProperties
 * - typeVersion is carried into properties when != 1
 * - Meta fields (disabled, continueOnFail, onError, credentials) are carried as properties
 */
export function mapN8nToWBNode(n8nNode: INode): WorkflowBuilderNode {
  const properties = mapN8nParametersToWBProperties(
    n8nNode.parameters,
    n8nNode.name,
    n8nNode.notes,
  );

  // Carry over typeVersion so round-trip preserves it (omit when default value of 1)
  if (n8nNode.typeVersion !== 1) {
    properties.typeVersion = n8nNode.typeVersion;
  }

  // Carry over meta fields that live on INode top-level
  if (n8nNode.disabled) properties.disabled = true;
  if (n8nNode.continueOnFail) properties.continueOnFail = true;
  if (n8nNode.onError) properties.onError = n8nNode.onError;
  if (n8nNode.credentials) properties.credentials = n8nNode.credentials;
  if (n8nNode.retryOnFail) properties.retryOnFail = true;
  if (typeof n8nNode.maxTries === 'number') properties.maxTries = n8nNode.maxTries;
  if (typeof n8nNode.waitBetweenTries === 'number') properties.waitBetweenTries = n8nNode.waitBetweenTries;
  if (n8nNode.notesInFlow) properties.notesInFlow = true;

  return {
    id: n8nNode.id,
    type: resolveWBNodeType(n8nNode.type),
    position: { x: n8nNode.position[0], y: n8nNode.position[1] },
    data: {
      type: n8nNode.type,
      icon: resolveIcon(n8nNode.type),
      properties,
    },
  };
}

/**
 * Convert n8n IConnections to WorkflowBuilderEdge[].
 *
 * Iterates through the n8n connection map (source node name -> connection types ->
 * output arrays -> connection targets) and produces React Flow edges.
 *
 * - Source handle format: 'output_N' for main connections, '{connectionType}_N' for AI types
 * - Target handle format: 'input_N' when index > 0, omitted when index == 0
 * - Edge IDs are generated as 'e-{counter}' ensuring uniqueness
 *
 * @param connections - n8n IConnections object (keyed by source node name)
 * @param nodeIdByName - Map from node name to node ID for resolving references
 */
export function mapConnectionsToEdges(
  connections: IConnections,
  nodeIdByName: Map<string, string>,
): WorkflowBuilderEdge[] {
  const edges: WorkflowBuilderEdge[] = [];
  let edgeCounter = 0;

  for (const [sourceName, nodeConnections] of Object.entries(connections)) {
    const sourceId = nodeIdByName.get(sourceName);
    if (!sourceId) continue;

    const nodeConns = nodeConnections as Record<string, NodeInputConnections>;
    for (const [connectionType, outputArrays] of Object.entries(nodeConns)) {
      for (let outputIndex = 0; outputIndex < outputArrays.length; outputIndex++) {
        const connectionsAtOutput = outputArrays[outputIndex];
        if (!connectionsAtOutput) continue;

        for (const conn of connectionsAtOutput) {
          const targetId = nodeIdByName.get(conn.node);
          if (!targetId) continue;

          const sourceHandle =
            connectionType === 'main'
              ? `output_${outputIndex}`
              : `${connectionType}_${outputIndex}`;

          const targetHandle = conn.index > 0 ? `input_${conn.index}` : undefined;

          edges.push({
            id: `e-${edgeCounter++}`,
            source: sourceId,
            target: targetId,
            sourceHandle,
            ...(targetHandle ? { targetHandle } : {}),
          });
        }
      }
    }
  }

  return edges;
}
