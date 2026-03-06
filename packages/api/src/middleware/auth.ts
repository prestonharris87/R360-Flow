import { FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import type { TenantContext, UserRole } from '@r360/types';

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 40,
  admin: 30,
  member: 20,
  viewer: 10,
};

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext: TenantContext;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
      statusCode: 401,
    });
  }

  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: process.env.JWT_ISSUER ?? 'r360-flow',
      audience: process.env.JWT_AUDIENCE ?? 'r360-flow-api',
    });

    const tenantId = payload.tenantId as string;
    const userId = payload.userId as string;
    const role = payload.role as UserRole;

    if (!tenantId || !userId || !role) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Token missing required claims (tenantId, userId, role)',
        statusCode: 401,
      });
    }

    request.tenantContext = {
      tenantId: tenantId as TenantContext['tenantId'],
      userId: userId as TenantContext['userId'],
      role,
    };
  } catch {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
      statusCode: 401,
    });
  }
}

export function requireRole(minimumRole: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userLevel = ROLE_HIERARCHY[request.tenantContext.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 0;

    if (userLevel < requiredLevel) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Requires ${minimumRole} role or higher`,
        statusCode: 403,
      });
    }
  };
}
