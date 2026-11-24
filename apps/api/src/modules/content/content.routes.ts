import { FastifyInstance } from 'fastify';
import { ContentController } from './content.controller';
import { authGuard } from '../../middleware/auth.guard';
import { roleGuard } from '../../middleware/role.guard';
import { UserRole } from '@devpilot/shared';

export async function contentRoutes(server: FastifyInstance) {
  // GET /content (protected, with search, filters, pagination)
  server.get(
    '/',
    {
      preHandler: [authGuard],
    },
    ContentController.list
  );

  // POST /content (protected, Analysts cannot create)
  server.post(
    '/',
    {
      preHandler: [authGuard],
    },
    ContentController.create
  );

  // GET /content/:id (protected)
  server.get(
    '/:id',
    {
      preHandler: [authGuard],
    },
    ContentController.getById
  );

  // PATCH /content/:id (protected, ownership & status rules enforced)
  server.patch(
    '/:id',
    {
      preHandler: [authGuard],
    },
    ContentController.update
  );

  // POST /content/:id/approve (protected, reviewers only)
  server.post(
    '/:id/approve',
    {
      preHandler: [authGuard, roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.APPROVER)],
    },
    ContentController.approve
  );

  // POST /content/:id/reject (protected, reviewers only)
  server.post(
    '/:id/reject',
    {
      preHandler: [authGuard, roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.APPROVER)],
    },
    ContentController.reject
  );

  // POST /content/:id/submit-review (protected, submit post for approval)
  server.post(
    '/:id/submit-review',
    {
      preHandler: [authGuard],
    },
    ContentController.submitReview
  );

  // POST /content/:id/archive (protected, archive content)
  server.post(
    '/:id/archive',
    {
      preHandler: [authGuard],
    },
    ContentController.archive
  );

  // POST /content/:id/restore (protected, restore archived content to draft)
  server.post(
    '/:id/restore',
    {
      preHandler: [authGuard],
    },
    ContentController.restore
  );

  // DELETE /content/:id (protected, ownership enforced)
  server.delete(
    '/:id',
    {
      preHandler: [authGuard],
    },
    ContentController.delete
  );
}
