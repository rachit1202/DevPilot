import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

import { config } from './config/env';
import { errorHandler } from './middleware/error.handler';
import { healthRoutes } from './modules/health/health.routes';
import { authRoutes } from './modules/auth/auth.routes';

export function buildServer(): FastifyInstance {
  const server = fastify({
    logger: {
      level: config.NODE_ENV === 'development' ? 'info' : 'warn',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
    },
    trustProxy: true,
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

  // 4. JWT Authentication Plugin
  server.register(fastifyJwt, {
    secret: config.JWT_SECRET,
  });

  // 5. Global Rate Limiter
  server.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  // 6. Centralized Error Handler
  server.setErrorHandler(errorHandler);

  // 7. Standard 404 Handler
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  // 8. Register Modular API Routes (/api/v1)
  server.register(
    async (v1) => {
      v1.register(healthRoutes);
      v1.register(authRoutes, { prefix: '/auth' });
    },
    { prefix: '/api/v1' }
  );

  return server;
}
