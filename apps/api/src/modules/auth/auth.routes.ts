import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller';
import { authGuard } from '../../middleware/auth.guard';
import { config } from '../../config/env';

export async function authRoutes(server: FastifyInstance) {
  // POST /auth/login (with dedicated rate limit)
  server.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: config.AUTH_RATE_LIMIT_MAX,
          timeWindow: '1 minute',
        },
      },
    },
    AuthController.login
  );

  // POST /auth/logout (protected)
  server.post(
    '/logout',
    {
      preHandler: [authGuard],
    },
    AuthController.logout
  );

  // GET /auth/me (protected)
  server.get(
    '/me',
    {
      preHandler: [authGuard],
    },
    AuthController.me
  );
}
