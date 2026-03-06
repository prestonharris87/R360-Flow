import type { IConnection, IConnections, NodeConnectionType } from './types.js';
import type { WorkflowBuilderEdge } from './wb-types.js';

/**
 * Parse a source handle string to extract connection type and output index.
 * Handle formats:
 *   - null/undefined -> { type: 'main', index: 0 }
 *   - "output_0"     -> { type: 'main', index: 0 }
 *   - "output_2"     -> { type: 'main', index: 2 }
 *   - "ai_tool_0"    -> { type: 'ai_tool', index: 0 }
 *   - "ai_agent_0"   -> { type: 'ai_agent', index: 0 }
 */
export function parseSourceHandle(handle: string | null | undefined): {
  connectionType: NodeConnectionType;
  outputIndex: number;
} {
  if (!handle) {
    return { connectionType: 'main', outputIndex: 0 };
  }

  // AI connection types: ai_tool_0, ai_agent_0, ai_memory_0, ai_outputParser_0
  const aiMatch = handle.match(/^(ai_\w+?)_(\d+)$/);
  if (aiMatch) {
    return {
      connectionType: aiMatch[1]! as NodeConnectionType,
      outputIndex: parseInt(aiMatch[2]!, 10),
    };
  }

  // Standard output: output_N
  const outputMatch = handle.match(/^output_(\d+)$/);
  if (outputMatch) {
    return {
      connectionType: 'main',
      outputIndex: parseInt(outputMatch[1]!, 10),
    };
  }

  return { connectionType: 'main', outputIndex: 0 };
}

/**
 * Parse a target handle string to extract the target input index.
 * Handle formats:
 *   - null/undefined -> 0
 *   - "input_0"      -> 0
 *   - "input_1"      -> 1
 */
export function parseTargetHandle(handle: string | null | undefined): number {
  if (!handle) return 0;
  const match = handle.match(/^input_(\d+)$/);
  return match ? parseInt(match[1]!, 10) : 0;
}

/**
 * Convert Workflow Builder edges to n8n IConnections.
 *
 * n8n connections use a node-name-based adjacency map:
 * {
 *   "Source Node Name": {
 *     "main": [           // connection type
 *       [                  // output index 0
 *         { node: "Target Node Name", type: "main", index: 0 }
 *       ],
 *       [                  // output index 1
 *         { node: "Other Target", type: "main", index: 0 }
 *       ]
 *     ]
 *   }
 * }
 */
export function mapEdgesToConnections(
  edges: WorkflowBuilderEdge[],
  nodeNameMap: Map<string, string>,
): IConnections {
  const connections: IConnections = {};

  for (const edge of edges) {
    const sourceName = nodeNameMap.get(edge.source);
    const targetName = nodeNameMap.get(edge.target);

    if (!sourceName || !targetName) {
      console.warn(
        `Edge ${edge.id} references unknown node: source=${edge.source}, target=${edge.target}`,
      );
      continue;
    }

    const { connectionType, outputIndex } = parseSourceHandle(edge.sourceHandle);
    const targetInputIndex = parseTargetHandle(edge.targetHandle);

    // Ensure the source node entry exists
    if (!connections[sourceName]) {
      connections[sourceName] = {};
    }
    const nodeConnections = connections[sourceName]!;

    // Ensure the connection type array exists
    if (!nodeConnections[connectionType]) {
      nodeConnections[connectionType] = [];
    }
    const outputArray = nodeConnections[connectionType]!;

    // Ensure the output index slot exists (fill gaps with empty arrays)
    while (outputArray.length <= outputIndex) {
      outputArray.push([]);
    }

    // Ensure the slot is an array (not null)
    if (!outputArray[outputIndex]) {
      outputArray[outputIndex] = [];
    }

    // Add the connection
    const connection: IConnection = {
      node: targetName,
      type: connectionType,
      index: targetInputIndex,
    };

    outputArray[outputIndex]!.push(connection);
  }

  return connections;
}
