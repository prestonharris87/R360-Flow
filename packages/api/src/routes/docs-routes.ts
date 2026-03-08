import type { FastifyInstance } from 'fastify';
import { generateOpenAPISpec } from '../docs/openapi-spec';

export async function docsRoutes(fastify: FastifyInstance): Promise<void> {
  const spec = generateOpenAPISpec();

  fastify.get('/api/docs', async (_request, reply) => {
    return reply.send(spec);
  });

  fastify.get('/api/docs/ui', async (_request, reply) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${spec.info.title} - API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: '/api/docs', dom_id: '#swagger-ui' });
  </script>
</body>
</html>`;
    return reply.type('text/html').send(html);
  });
}
