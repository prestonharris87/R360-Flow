import type { FastifyInstance } from 'fastify';
import {
  R360NodeTypes,
  buildNodePalette,
} from '@r360/execution-engine';
import type { PaletteFilterOptions } from '@r360/execution-engine';

/**
 * Singleton instance of R360NodeTypes.
 * Initialized once on first request, then cached for subsequent requests.
 * Node types are stateless and shared across all tenants.
 */
let cachedNodeTypes: R360NodeTypes | null = null;

async function getNodeTypes(): Promise<R360NodeTypes> {
  if (cachedNodeTypes) return cachedNodeTypes;

  const nodeTypes = new R360NodeTypes();
  await nodeTypes.init();
  cachedNodeTypes = nodeTypes;
  return nodeTypes;
}

export async function nodeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/nodes
   *
   * Returns the node palette -- all available n8n node types converted
   * to PaletteItem format for the Workflow Builder frontend.
   *
   * Query parameters:
   *   - category: Filter by node category (e.g., 'Development', 'Communication')
   *   - search: Full-text search across label, description, and type name
   */
  app.get('/api/nodes', async (request, reply) => {
    const nodeTypes = await getNodeTypes();

    const query = request.query as Record<string, string>;
    const filters: PaletteFilterOptions = {};

    if (query.category) {
      filters.category = query.category;
    }
    if (query.search) {
      filters.search = query.search;
    }

    const palette = buildNodePalette(nodeTypes, filters);

    return reply.send({
      nodes: palette,
      total: palette.length,
    });
  });

  /**
   * GET /api/nodes/:type
   *
   * Returns a single node palette item by its full type name.
   * E.g., GET /api/nodes/n8n-nodes-base.httpRequest
   */
  app.get('/api/nodes/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    const nodeTypes = await getNodeTypes();

    const palette = buildNodePalette(nodeTypes);
    const item = palette.find((node) => node.type === type);

    if (!item) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Node type '${type}' not found`,
        statusCode: 404,
      });
    }

    return reply.send(item);
  });
}
