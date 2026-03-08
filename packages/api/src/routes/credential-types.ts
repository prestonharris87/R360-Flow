import type { FastifyInstance } from 'fastify';
import {
  getCredentialTypeRegistry,
  isBootstrapped,
} from '@r360/execution-engine';
import type { CredentialTypeRegistry } from '@r360/execution-engine';
import {
  CredentialTypeQuerySchema,
  CredentialTypeParamSchema,
  CredentialTypeFilterQuerySchema,
} from '@r360/types';

/**
 * Credential Type Routes
 *
 * Read-only metadata endpoints for credential type definitions.
 * These expose the credential type schema catalog loaded from n8n-nodes-base
 * so the frontend can render credential forms, filter by node compatibility,
 * and display credential type metadata.
 *
 * No tenant-specific data is exposed here -- these are global, shared
 * definitions. Authentication is still required (handled by the global
 * auth hook in server.ts) but no admin role check is needed.
 *
 * Encrypted credential data is NEVER returned by these endpoints (they
 * deal only with type definitions, not stored credential values).
 */

/**
 * Safely get the credential type registry, or null if not yet initialized.
 * Returns null when bootstrap has not completed (caller should return 503).
 */
function getRegistrySafe(): CredentialTypeRegistry | null {
  if (!isBootstrapped()) return null;
  try {
    return getCredentialTypeRegistry();
  } catch {
    return null;
  }
}

/**
 * Summarize credential type properties for the list endpoint.
 * Returns only name, displayName, type, and required -- not the full
 * INodeProperties shape (which includes options, default values, etc.).
 */
function summarizeProperties(
  properties: Array<{ name: string; displayName: string; type: string; required?: boolean }>
): Array<{ name: string; displayName: string; type: string; required?: boolean }> {
  return properties.map((prop) => ({
    name: prop.name,
    displayName: prop.displayName,
    type: prop.type,
    ...(prop.required !== undefined ? { required: prop.required } : {}),
  }));
}

export async function credentialTypeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/credential-types
   *
   * Lists all available credential types with summary metadata.
   *
   * Query parameters:
   *   - nodeType: Filter to credential types compatible with a specific node
   *              (e.g., "n8n-nodes-base.slack")
   *   - search:   Search by name or displayName (case-insensitive substring match)
   */
  app.get('/api/credential-types', async (request, reply) => {
    const registry = getRegistrySafe();
    if (!registry) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Credential type registry is not initialized. Server may still be starting up.',
        statusCode: 503,
      });
    }

    const queryResult = CredentialTypeQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        statusCode: 400,
        details: queryResult.error.flatten(),
      });
    }

    const { nodeType, search } = queryResult.data;

    let allTypes = registry.getAll();

    // Filter by node type compatibility if requested.
    // A credential type is compatible with a node if the node's description
    // lists it in its `credentials` array. We check getSupportedNodes() to
    // see if the requested nodeType is among the nodes that support each
    // credential type.
    if (nodeType) {
      allTypes = allTypes.filter((credType) => {
        const supportedNodes = registry.getSupportedNodes(credType.name);
        return supportedNodes.includes(nodeType);
      });
    }

    // Filter by search term (case-insensitive substring match on name and displayName)
    if (search) {
      const lowerSearch = search.toLowerCase();
      allTypes = allTypes.filter(
        (credType) =>
          credType.name.toLowerCase().includes(lowerSearch) ||
          credType.displayName.toLowerCase().includes(lowerSearch)
      );
    }

    const result = allTypes.map((credType) => ({
      name: credType.name,
      displayName: credType.displayName,
      ...(credType.icon ? { icon: credType.icon } : {}),
      ...(credType.iconColor ? { iconColor: credType.iconColor } : {}),
      ...(credType.documentationUrl ? { documentationUrl: credType.documentationUrl } : {}),
      supportedNodes: registry.getSupportedNodes(credType.name),
      ...(credType.extends ? { extends: credType.extends } : {}),
      properties: summarizeProperties(credType.properties),
    }));

    return reply.send(result);
  });

  /**
   * GET /api/credential-types/filter
   *
   * Filters credential types by expressions (credential type names that a node
   * declares it supports). Returns matching types with summary metadata.
   *
   * Query parameters:
   *   - expressions: Comma-separated list of credential type names to filter by (required)
   *   - search:      Optional search term for further filtering by name/displayName
   *
   * This route MUST be registered before /:name so Fastify doesn't treat
   * "filter" as a :name parameter.
   */
  app.get('/api/credential-types/filter', async (request, reply) => {
    const registry = getRegistrySafe();
    if (!registry) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Credential type registry is not initialized. Server may still be starting up.',
        statusCode: 503,
      });
    }

    const queryResult = CredentialTypeFilterQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        statusCode: 400,
        details: queryResult.error.flatten(),
      });
    }

    const { expressions, search } = queryResult.data;
    const filtered = registry.filterByExpressions(expressions.split(','), search);

    const result = filtered.map((credType) => ({
      name: credType.name,
      displayName: credType.displayName,
      ...(credType.icon ? { icon: credType.icon } : {}),
      ...(credType.iconColor ? { iconColor: credType.iconColor } : {}),
      ...(credType.documentationUrl ? { documentationUrl: credType.documentationUrl } : {}),
      ...((credType as any).httpRequestNode ? { httpRequestNode: (credType as any).httpRequestNode } : {}),
    }));

    return reply.send(result);
  });

  /**
   * GET /api/credential-types/:name
   *
   * Returns the full credential type schema for a specific type.
   * Includes all properties with full detail, authenticate config,
   * test specification, extends chain, and merged properties from
   * parent types.
   */
  app.get('/api/credential-types/:name', async (request, reply) => {
    const registry = getRegistrySafe();
    if (!registry) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Credential type registry is not initialized. Server may still be starting up.',
        statusCode: 503,
      });
    }

    const paramResult = CredentialTypeParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid credential type name',
        statusCode: 400,
      });
    }

    const { name } = paramResult.data;

    if (!registry.recognizes(name)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Credential type '${name}' not found`,
        statusCode: 404,
      });
    }

    const credType = registry.getByName(name);

    // Include merged properties from parent types for convenience
    const mergedProperties = registry.getCredentialsProperties(name);
    const supportedNodes = registry.getSupportedNodes(name);
    const parentTypes = registry.getParentTypes(name);

    return reply.send({
      ...credType,
      mergedProperties,
      supportedNodes,
      parentTypes,
    });
  });

  /**
   * GET /api/credential-types/:name/properties
   *
   * Returns just the form properties with inheritance resolved.
   * This is a simpler endpoint specifically for rendering credential
   * forms -- returns the merged INodeProperties[] from the type and
   * all its parents.
   */
  app.get('/api/credential-types/:name/properties', async (request, reply) => {
    const registry = getRegistrySafe();
    if (!registry) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Credential type registry is not initialized. Server may still be starting up.',
        statusCode: 503,
      });
    }

    const paramResult = CredentialTypeParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid credential type name',
        statusCode: 400,
      });
    }

    const { name } = paramResult.data;

    if (!registry.recognizes(name)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Credential type '${name}' not found`,
        statusCode: 404,
      });
    }

    const properties = registry.getCredentialsProperties(name);

    return reply.send(properties);
  });
}
