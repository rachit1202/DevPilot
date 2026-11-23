import { FastifyInstance } from 'fastify';
import { MediaController } from './media.controller';
import { authGuard } from '../../middleware/auth.guard';
import { roleGuard } from '../../middleware/role.guard';
import { UserRole } from '@devpilot/shared';

export async function mediaRoutes(server: FastifyInstance) {
  // POST /media/upload (protected, with upload rate limit: 20 per minute)
  server.post(
    '/upload',
    {
      preHandler: [authGuard],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    MediaController.upload
  );

  // GET /media (protected)
  server.get(
    '/',
    {
      preHandler: [authGuard],
    },
    MediaController.list
  );

  // GET /media/:id (protected)
  server.get(
    '/:id',
    {
      preHandler: [authGuard],
    },
    MediaController.getById
  );

  // GET /media/:id/file (protected, streams binary asset)
  server.get(
    '/:id/file',
    {
      preHandler: [authGuard],
    },
    MediaController.getFile
  );

  // DELETE /media/:id (protected, Owner/Admin only)
  server.delete(
    '/:id',
    {
      preHandler: [authGuard, roleGuard(UserRole.OWNER, UserRole.ADMIN)],
    },
    MediaController.delete
  );
}
