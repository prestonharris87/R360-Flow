export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, unknown>;
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
  security: Array<Record<string, string[]>>;
}

export function generateOpenAPISpec(): OpenAPISpec {
  return {
    openapi: '3.0.3',
    info: {
      title: 'R360 Flow API',
      version: '1.0.0',
      description: 'Multi-tenant workflow automation platform API',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
    ],
    paths: {
      // Workflows
      '/api/workflows': {
        get: { summary: 'List workflows', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'List of workflows' } } },
        post: { summary: 'Create workflow', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created workflow' } } },
      },
      '/api/workflows/{id}': {
        get: { summary: 'Get workflow', tags: ['Workflows'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Workflow details' } } },
        put: { summary: 'Update workflow', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Updated workflow' } } },
        delete: { summary: 'Delete workflow', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { '204': { description: 'Deleted' } } },
      },
      // Executions
      '/api/executions': {
        get: { summary: 'List executions', tags: ['Executions'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'List of executions' } } },
      },
      '/api/workflows/{id}/execute': {
        post: { summary: 'Execute workflow', tags: ['Executions'], security: [{ bearerAuth: [] }], responses: { '202': { description: 'Execution started' } } },
      },
      // Credentials
      '/api/credentials': {
        get: { summary: 'List credentials', tags: ['Credentials'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'List of credentials' } } },
        post: { summary: 'Create credential', tags: ['Credentials'], security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created credential' } } },
      },
      // Templates
      '/api/templates': {
        get: { summary: 'List templates', tags: ['Templates'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'List of templates' } } },
        post: { summary: 'Create template', tags: ['Templates'], security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created template' } } },
      },
      '/api/templates/{id}': {
        get: { summary: 'Get template', tags: ['Templates'], responses: { '200': { description: 'Template details' } } },
        put: { summary: 'Update template', tags: ['Templates'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Updated template' } } },
        delete: { summary: 'Delete template', tags: ['Templates'], security: [{ bearerAuth: [] }], responses: { '204': { description: 'Deleted' } } },
      },
      '/api/templates/{id}/fork': {
        post: { summary: 'Fork template to workflow', tags: ['Templates'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Forked workflow data' } } },
      },
      // Admin
      '/api/admin/tenants': {
        post: { summary: 'Create tenant', tags: ['Admin'], security: [{ apiKeyAuth: [] }], responses: { '201': { description: 'Created tenant' } } },
      },
      '/api/admin/tenants/{id}': {
        get: { summary: 'Get tenant', tags: ['Admin'], security: [{ apiKeyAuth: [] }], responses: { '200': { description: 'Tenant details' } } },
        delete: { summary: 'Deactivate tenant', tags: ['Admin'], security: [{ apiKeyAuth: [] }], responses: { '200': { description: 'Deactivated' } } },
      },
      '/api/admin/tenants/{id}/plan': {
        put: { summary: 'Update tenant plan', tags: ['Admin'], security: [{ apiKeyAuth: [] }], responses: { '200': { description: 'Updated plan' } } },
      },
      // Billing
      '/api/billing/webhook': {
        post: { summary: 'Stripe webhook', tags: ['Billing'], responses: { '200': { description: 'Webhook processed' } } },
      },
      // Theme
      '/api/theme': {
        get: { summary: 'Get tenant theme', tags: ['Theme'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Theme config' } } },
        put: { summary: 'Update theme', tags: ['Theme'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Updated theme' } } },
        delete: { summary: 'Reset theme', tags: ['Theme'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Reset to default' } } },
      },
      // Health
      '/api/health': {
        get: { summary: 'Health check', tags: ['Health'], responses: { '200': { description: 'Health status' } } },
      },
      '/api/health/ready': {
        get: { summary: 'Readiness probe', tags: ['Health'], responses: { '200': { description: 'Ready' } } },
      },
      '/api/health/live': {
        get: { summary: 'Liveness probe', tags: ['Health'], responses: { '200': { description: 'Alive' } } },
      },
      '/api/metrics': {
        get: { summary: 'Application metrics', tags: ['Health'], responses: { '200': { description: 'Metrics data' } } },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-admin-api-key' },
      },
      schemas: {
        Workflow: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, tenantId: { type: 'string' } } },
        Execution: { type: 'object', properties: { id: { type: 'string' }, workflowId: { type: 'string' }, status: { type: 'string' } } },
        Template: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, category: { type: 'string' } } },
        Tenant: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, plan: { type: 'string' } } },
        ThemeConfig: { type: 'object', properties: { primaryColor: { type: 'string' }, appName: { type: 'string' } } },
        HealthStatus: { type: 'object', properties: { status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] } } },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}
