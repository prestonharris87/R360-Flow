/**
 * n8n-Compatible API Routes
 *
 * These endpoints respond in the format n8n's editor-ui expects,
 * enabling the n8n editor to talk to the R360 Flow API backend
 * instead of a real n8n server instance.
 *
 * All /rest/* endpoints wrap responses in { data: ... } to match
 * n8n's makeRestApiRequest() unwrapping convention.
 *
 * The /types/* endpoints return raw data (no wrapper) since the
 * editor fetches those differently.
 */
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { workflows, getDb } from '@r360/db';
import { R360NodeTypes } from '@r360/execution-engine';
import { translateN8nToWB, translateWBToN8n } from '@r360/json-translator';
import type { WorkflowParameters } from '@r360/json-translator';
import { generateFrontendSettings } from '../services/n8n-compat-settings';

/**
 * Singleton R360NodeTypes instance for the n8n-compat routes.
 * Initialized on first request, shared thereafter.
 */
let cachedNodeTypes: R360NodeTypes | null = null;

async function getNodeTypes(): Promise<R360NodeTypes> {
  if (cachedNodeTypes) return cachedNodeTypes;

  const nodeTypes = new R360NodeTypes();
  await nodeTypes.init();
  cachedNodeTypes = nodeTypes;
  return nodeTypes;
}

export async function n8nCompatRoutes(fastify: FastifyInstance): Promise<void> {
  // =========================================================================
  // SETTINGS
  // =========================================================================

  /**
   * GET /api/n8n-compat/rest/settings
   *
   * Returns FrontendSettings with previewMode: true.
   * n8n's editor calls this on startup to configure itself.
   */
  fastify.get('/api/n8n-compat/rest/settings', async (_request, reply) => {
    const settings = generateFrontendSettings();
    return reply.send({ data: settings });
  });

  // =========================================================================
  // NODE TYPES
  // =========================================================================

  /**
   * GET /api/n8n-compat/types/nodes.json
   *
   * Returns INodeTypeDescription[] (NOT wrapped in { data: ... }).
   * The n8n editor fetches this as a raw JSON array.
   */
  fastify.get('/api/n8n-compat/types/nodes.json', async (_request, reply) => {
    const nodeTypes = await getNodeTypes();
    const descriptions = nodeTypes.getNodeTypeDescriptions();
    console.log(`[R360 n8n-compat] Returning ${descriptions.length} node type descriptions`);
    return reply.send(descriptions);
  });

  /**
   * GET /api/n8n-compat/types/node-versions.json
   *
   * Returns an empty object. The editor uses this for version tracking
   * but an empty object is sufficient for our use case.
   */
  fastify.get('/api/n8n-compat/types/node-versions.json', async (_request, reply) => {
    return reply.send({});
  });

  /**
   * POST /api/n8n-compat/rest/node-types
   *
   * Accepts { nodeInfos: [{ name, version }] } and returns the
   * corresponding INodeTypeDescription[] for those specific nodes.
   */
  fastify.post('/api/n8n-compat/rest/node-types', async (request, reply) => {
    const body = request.body as {
      nodeInfos?: Array<{ name: string; version?: number }>;
    };

    if (!body.nodeInfos || !Array.isArray(body.nodeInfos)) {
      return reply.status(400).send({
        data: [],
        message: 'nodeInfos array is required',
      });
    }

    const nodeTypes = await getNodeTypes();
    const results: unknown[] = [];

    for (const info of body.nodeInfos) {
      try {
        const nodeType = nodeTypes.getByNameAndVersion(info.name, info.version);
        if (nodeType && 'description' in nodeType) {
          results.push(nodeType.description);
        }
      } catch {
        // Node type not found -- skip silently (n8n editor handles missing gracefully)
      }
    }

    return reply.send({ data: results });
  });

  // =========================================================================
  // WORKFLOWS
  // =========================================================================

  /**
   * GET /api/n8n-compat/rest/workflows/new
   *
   * Returns default data for a new workflow.
   * n8n's editor calls this when creating a new workflow.
   */
  fastify.get('/api/n8n-compat/rest/workflows/new', async (_request, reply) => {
    return reply.send({
      data: {
        name: 'New Workflow',
        defaultSettings: {
          executionOrder: 'v1',
        },
      },
    });
  });

  /**
   * GET /api/n8n-compat/rest/workflows/:id
   *
   * Fetches a workflow from our DB, translates to n8n format, and
   * wraps in { data: workflow }.
   *
   * The definitionJson stored in our DB is a DiagramModel (Workflow Builder
   * format). We translate it to n8n WorkflowParameters for the editor.
   * If the definitionJson is already in n8n format (has top-level `nodes`),
   * we pass it through directly.
   */
  fastify.get('/api/n8n-compat/rest/workflows/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const db = getDb();

      // Use a default tenant for n8n-compat (preview mode, no auth)
      const defaultTenantId = '00000000-0000-0000-0000-000000000001';

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, id),
            eq(workflows.tenantId, defaultTenantId),
          )
        );

      if (!workflow) {
        return reply.status(404).send({
          data: null,
          message: 'Workflow not found',
        });
      }

      // Translate definitionJson to n8n format if needed
      const definition = workflow.definitionJson as Record<string, unknown>;
      let n8nWorkflow: WorkflowParameters;

      if (Array.isArray(definition.nodes)) {
        // Already in n8n format
        n8nWorkflow = {
          name: workflow.name,
          nodes: definition.nodes as WorkflowParameters['nodes'],
          connections: (definition.connections ?? {}) as WorkflowParameters['connections'],
          active: workflow.isActive,
          settings: (definition.settings as WorkflowParameters['settings']) ?? {
            executionOrder: 'v1',
          },
        };
      } else if (definition.diagram) {
        // DiagramModel format -- translate
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        n8nWorkflow = translateWBToN8n(definition as any);
        n8nWorkflow.active = workflow.isActive;
      } else {
        // Empty or unknown format -- return a minimal valid workflow
        n8nWorkflow = {
          name: workflow.name,
          nodes: [],
          connections: {},
          active: workflow.isActive,
          settings: { executionOrder: 'v1' },
        };
      }

      // Build the response in n8n's expected format
      const responseWorkflow = {
        id: workflow.id,
        name: workflow.name,
        active: workflow.isActive,
        nodes: n8nWorkflow.nodes,
        connections: n8nWorkflow.connections,
        settings: n8nWorkflow.settings ?? { executionOrder: 'v1' },
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
        tags: [],
        pinData: {},
        versionId: workflow.id, // Use workflow ID as version ID
      };

      return reply.send({ data: responseWorkflow });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      return reply.status(500).send({
        data: null,
        message: `Failed to fetch workflow: ${message}`,
      });
    }
  });

  /**
   * PATCH /api/n8n-compat/rest/workflows/:id
   *
   * Accepts n8n WorkflowDataUpdate, translates back to DiagramModel,
   * and saves to DB.
   */
  fastify.patch('/api/n8n-compat/rest/workflows/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    try {
      const db = getDb();
      const defaultTenantId = '00000000-0000-0000-0000-000000000001';

      // Check workflow exists
      const [existing] = await db
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, id),
            eq(workflows.tenantId, defaultTenantId),
          )
        );

      if (!existing) {
        return reply.status(404).send({
          data: null,
          message: 'Workflow not found',
        });
      }

      // Build the n8n WorkflowParameters from the request body
      const n8nNodes = (body.nodes ?? []) as WorkflowParameters['nodes'];
      const n8nConnections = (body.connections ?? {}) as WorkflowParameters['connections'];
      const n8nSettings = (body.settings ?? { executionOrder: 'v1' }) as WorkflowParameters['settings'];
      const workflowName = (body.name as string) ?? existing.name;

      // Translate to DiagramModel for storage
      const n8nWorkflow: WorkflowParameters = {
        name: workflowName,
        nodes: n8nNodes,
        connections: n8nConnections,
        active: (body.active as boolean) ?? existing.isActive,
        settings: n8nSettings,
      };

      let definitionJson: Record<string, unknown>;

      try {
        // Attempt to translate to DiagramModel (Workflow Builder format)
        const diagramModel = translateN8nToWB(n8nWorkflow);
        definitionJson = diagramModel as unknown as Record<string, unknown>;
      } catch {
        // If translation fails, store in n8n format directly
        definitionJson = {
          name: workflowName,
          nodes: n8nNodes,
          connections: n8nConnections,
          settings: n8nSettings,
          active: n8nWorkflow.active,
        };
      }

      // Update the workflow in DB
      const [updated] = await db
        .update(workflows)
        .set({
          name: workflowName,
          definitionJson,
          isActive: n8nWorkflow.active ?? false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflows.id, id),
            eq(workflows.tenantId, defaultTenantId),
          )
        )
        .returning();

      if (!updated) {
        return reply.status(500).send({
          data: null,
          message: 'Failed to update workflow',
        });
      }

      // Return the workflow in n8n format
      const responseWorkflow = {
        id: updated.id,
        name: updated.name,
        active: updated.isActive,
        nodes: n8nNodes,
        connections: n8nConnections,
        settings: n8nSettings,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        tags: [],
        pinData: {},
        versionId: updated.id,
      };

      return reply.send({ data: responseWorkflow });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      return reply.status(500).send({
        data: null,
        message: `Failed to update workflow: ${message}`,
      });
    }
  });

  // =========================================================================
  // STUBS -- return empty arrays / minimal data
  // =========================================================================

  /** GET /api/n8n-compat/rest/credentials */
  fastify.get('/api/n8n-compat/rest/credentials', async (_request, reply) => {
    return reply.send({ data: [] });
  });

  /** GET /api/n8n-compat/rest/tags */
  fastify.get('/api/n8n-compat/rest/tags', async (_request, reply) => {
    return reply.send({ data: [] });
  });

  /** GET /api/n8n-compat/rest/community-node-types */
  fastify.get('/api/n8n-compat/rest/community-node-types', async (_request, reply) => {
    return reply.send({ data: [] });
  });

  /** GET /api/n8n-compat/rest/node-translation-headers */
  fastify.get('/api/n8n-compat/rest/node-translation-headers', async (_request, reply) => {
    return reply.send({ data: undefined });
  });

  /** GET /api/n8n-compat/rest/variables */
  fastify.get('/api/n8n-compat/rest/variables', async (_request, reply) => {
    return reply.send({ data: [] });
  });

  /** GET /api/n8n-compat/rest/projects */
  fastify.get('/api/n8n-compat/rest/projects', async (_request, reply) => {
    return reply.send({ data: [] });
  });

  /** GET /api/n8n-compat/rest/active-workflows */
  fastify.get('/api/n8n-compat/rest/active-workflows', async (_request, reply) => {
    return reply.send({ data: [] });
  });
}
