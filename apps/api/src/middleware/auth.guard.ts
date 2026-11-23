import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthUser } from '../types/fastify';

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 1. Try reading JWT from HttpOnly cookie
    let token = request.cookies?.access_token;

    // 2. Fallback to Authorization: Bearer <token> header for API clients / testing
    if (!token && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required. Please log in.',
      });
    }

    // 3. Verify JWT signature using Fastify JWT plugin
    const decoded = await request.server.jwt.verify<AuthUser>(token);
    request.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
  } catch (err) {
    return reply.status(401).send({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired session. Please log in again.',
    });
  }
}
