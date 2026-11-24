import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';

import { config } from './config/env';
import { errorHandler } from './middleware/error.handler';
import { csrfProtection } from './middleware/csrf.guard';
import { healthRoutes } from './modules/health/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { contentRoutes } from './modules/content/content.routes';
import { mediaRoutes } from './modules/media/media.routes';
import { calendarRoutes } from './modules/calendar/calendar.routes';
import { settingsRoutes } from './modules/settings/settings.routes';
import { approvalRoutes } from './modules/approval/approval.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';

export function buildServer(): FastifyInstance {
  const server = fastify({
    bodyLimit: 1048576, // 1MB maximum payload to prevent memory exhaustion & unbounded buffer allocation
    logger: {
      level: config.NODE_ENV === 'development' ? 'info' : 'warn',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
    },
    trustProxy: true,
  });

  // Support empty JSON bodies gracefully (e.g. POST requests without payload)
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = typeof body === 'string' ? body : (body as Buffer)?.toString('utf8') || '';
    if (!raw || raw.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // 1. Security Headers (Helmet)
  server.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // 2. Cross-Origin Resource Sharing (CORS)
  server.register(cors, {
    origin: [config.WEB_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });

  // 3. Cookie Parser
  server.register(fastifyCookie, {
    secret: config.COOKIE_SECRET,
    hook: 'onRequest',
  });

  // 4. JWT Authentication Plugin — Hardened with explicit HS256 pinning & cache disabled
  server.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
    },
    verify: {
      algorithms: ['HS256'],
      cache: false, // Disables verifier caching, eliminating cache confusion & expired token cache persistence
    },
  });

  // 5. Global Rate Limiter
  server.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
  });

  // 6. Multipart Form/File Upload Support
  server.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit per file
      files: 1, // 1 file per upload request
    },
  });

  // 7. Centralized Error Handler
  server.setErrorHandler(errorHandler);

  // 8. CSRF Origin Hardening for Cookie-Authenticated State-Changing Requests
  server.addHook('preHandler', csrfProtection);

  // 9. Standard 404 Handler
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  // 10. Register Modular API Routes (/api/v1)
  server.register(
    async (v1) => {
      v1.register(healthRoutes);
      v1.register(authRoutes, { prefix: '/auth' });
      v1.register(contentRoutes, { prefix: '/content' });
      v1.register(mediaRoutes, { prefix: '/media' });
      v1.register(calendarRoutes, { prefix: '/calendar' });
      v1.register(settingsRoutes, { prefix: '/settings' });
      v1.register(approvalRoutes, { prefix: '/approvals' });
      v1.register(dashboardRoutes, { prefix: '/dashboard' });
    },
    { prefix: '/api/v1' }
  );

  return server;
}
