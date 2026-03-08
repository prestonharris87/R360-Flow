import type { INodeParameters, NodeParameterValue } from './types';
import { META_PROPERTIES } from './node-mapping';

/**
 * Re-export META_PROPERTIES as META_PROPERTY_KEYS for clarity.
 * This is the canonical set of property keys that represent node metadata
 * in the Workflow Builder. They are stripped during forward mapping (WB -> n8n)
 * because they are stored on the INode itself, not inside INodeParameters.
 */
export const META_PROPERTY_KEYS = META_PROPERTIES;

/**
 * Convert Workflow Builder node properties to n8n INodeParameters.
 *
 * Strips metadata fields (label, description, typeVersion, disabled, etc.)
 * and passes everything else through as-is. Expression strings
 * (e.g., `={{ $json.field }}`) are preserved unmodified. Nested objects
 * and arrays (collections, fixedCollections) are preserved by reference.
 *
 * Returns an empty object for empty or undefined input.
 */
export function mapWBPropertiesToN8nParameters(
  properties: Record<string, unknown> | undefined | null,
): INodeParameters {
  if (!properties) return {};

  const params: INodeParameters = {};

  for (const [key, value] of Object.entries(properties)) {
    if (META_PROPERTY_KEYS.has(key)) continue;
    params[key] = value as NodeParameterValue;
  }

  return params;
}

/**
 * Convert n8n INodeParameters back to Workflow Builder node properties.
 *
 * Re-adds the `label` metadata field from `nodeName` (if provided) and
 * the `description` metadata field from `nodeNotes` (if provided).
 * All parameter values are preserved unchanged, including expression strings.
 *
 * Returns an empty object for empty or undefined input.
 */
export function mapN8nParametersToWBProperties(
  parameters: INodeParameters | undefined | null,
  nodeName?: string,
  nodeNotes?: string,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  if (nodeName) {
    properties.label = nodeName;
  }

  if (nodeNotes) {
    properties.description = nodeNotes;
  }

  if (!parameters) return properties;

  for (const [key, value] of Object.entries(parameters)) {
    properties[key] = value;
  }

  return properties;
}
