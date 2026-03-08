/**
 * Icon-Serving API Routes
 *
 * Serves n8n node icons (SVG, PNG, JPG) from installed npm packages.
 * Icons are resolved from the actual installed package directories,
 * with path traversal protection to prevent reading arbitrary files.
 *
 * Public routes (no auth required) -- icons are static assets.
 */
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Allowed package names that icons can be served from.
 * Maps a "slug" used in the URL to the actual npm package name.
 */
const ALLOWED_PACKAGES: Record<string, string> = {
  'n8n-nodes-base': 'n8n-nodes-base',
  '@n8n/n8n-nodes-langchain': '@n8n/n8n-nodes-langchain',
};

/**
 * Content-Type mapping for supported icon file extensions.
 */
const CONTENT_TYPE_MAP: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * Resolve the base directory of an installed npm package.
 * Returns null if the package is not installed.
 */
function resolvePackageDir(packageName: string): string | null {
  try {
    const pkgJsonPath = require.resolve(`${packageName}/package.json`);
    return path.dirname(pkgJsonPath);
  } catch {
    return null;
  }
}

export async function iconRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/icons/n8n-nodes-base/<path-to-icon>
   *
   * Serves icon files from the n8n-nodes-base package.
   */
  fastify.get('/api/icons/n8n-nodes-base/*', async (request, reply) => {
    const iconPath = (request.params as { '*': string })['*'];
    return serveIcon('n8n-nodes-base', iconPath, reply);
  });

  /**
   * GET /api/icons/@n8n/n8n-nodes-langchain/<path-to-icon>
   *
   * Serves icon files from the @n8n/n8n-nodes-langchain scoped package.
   * The scoped package name contains a slash, so it needs its own route.
   */
  fastify.get('/api/icons/@n8n/n8n-nodes-langchain/*', async (request, reply) => {
    const iconPath = (request.params as { '*': string })['*'];
    return serveIcon('@n8n/n8n-nodes-langchain', iconPath, reply);
  });
}

/**
 * Serve an icon file from the specified package.
 *
 * Security: validates the package name is in the allow-list,
 * checks file extension is a supported image type, and ensures
 * the resolved path does not escape the package directory
 * (path traversal protection).
 */
async function serveIcon(
  packageName: string,
  iconPath: string,
  reply: import('fastify').FastifyReply,
): Promise<import('fastify').FastifyReply> {
  // Validate package is in the allow-list
  if (!ALLOWED_PACKAGES[packageName]) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: `Package "${packageName}" is not in the allowed list`,
    });
  }

  // Validate icon path is provided
  if (!iconPath) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Icon path is required',
    });
  }

  // Validate file extension is a supported image type
  const ext = path.extname(iconPath).toLowerCase();
  const contentType = CONTENT_TYPE_MAP[ext];
  if (!contentType) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: `Unsupported file type: ${ext || '(none)'}`,
    });
  }

  // Resolve the package base directory
  const packageDir = resolvePackageDir(packageName);
  if (!packageDir) {
    return reply.status(404).send({
      error: 'Not Found',
      message: `Package "${packageName}" is not installed`,
    });
  }

  // Resolve the full file path and apply path traversal protection
  const resolvedPath = path.resolve(packageDir, iconPath);
  if (!resolvedPath.startsWith(packageDir + path.sep) && resolvedPath !== packageDir) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid icon path (path traversal detected)',
    });
  }

  // Check file exists
  try {
    await fs.promises.access(resolvedPath, fs.constants.R_OK);
  } catch {
    return reply.status(404).send({
      error: 'Not Found',
      message: 'Icon file not found',
    });
  }

  // Read and serve the file
  const fileBuffer = await fs.promises.readFile(resolvedPath);

  return reply
    .header('Content-Type', contentType)
    .header('Cache-Control', 'public, max-age=86400')
    .send(fileBuffer);
}
