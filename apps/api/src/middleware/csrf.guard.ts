import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/env';

export async function csrfProtection(request: FastifyRequest, reply: FastifyReply) {
  const method = request.method.toUpperCase();

  // 1. Safe methods (GET, HEAD, OPTIONS) do not alter server state
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return;
  }

  // 2. Programmatic Bearer token authentication is immune to ambient CSRF attacks
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return;
  }

  // 3. For cookie-authenticated requests or cookie-setting routes, enforce Origin / Referer validation
  const hasCookie = Boolean(request.cookies?.access_token);
  const isAuthRoute = request.url.includes('/auth/login') || request.url.includes('/auth/logout');

  if (hasCookie || isAuthRoute) {
    const origin = request.headers.origin;
    const referer = request.headers.referer;

    let requestOrigin: string | null = null;

    if (origin) {
      requestOrigin = origin;
    } else if (referer) {
      try {
        const parsed = new URL(referer);
        requestOrigin = parsed.origin;
      } catch {
        requestOrigin = null;
      }
    }

    const allowedOrigin = new URL(config.WEB_URL).origin;

    if (!requestOrigin || requestOrigin !== allowedOrigin) {
      request.log.warn(
        {
          method,
          url: request.url,
          origin,
          referer,
          expectedOrigin: allowedOrigin,
        },
        'CSRF Origin validation blocked request'
      );

      return reply.status(403).send({
        success: false,
        error: 'Forbidden',
        message: 'CSRF protection: Invalid or unauthorized request origin.',
      });
    }
  }
}
