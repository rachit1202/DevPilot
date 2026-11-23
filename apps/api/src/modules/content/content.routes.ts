import { FastifyInstance } from 'fastify';
import { ContentController } from './content.controller';
import { authGuard } from '../../middleware/auth.guard';

export async function contentRoutes(server: FastifyInstance) {
  // GET /content (protected, with search, filters, pagination)
  server.get(
    '/',
    {
      preHandler: [authGuard],
    },
    ContentController.list
  );

  // POST /content (protected)
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

  // PATCH /content/:id (protected)
  server.patch(
    '/:id',
    {
      preHandler: [authGuard],
    },
    ContentController.update
  );

  // DELETE /content/:id (protected)
  server.delete(
    '/:id',
    {
      preHandler: [authGuard],
    },
    ContentController.delete
  );
}
