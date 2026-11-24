import { FastifyInstance } from 'fastify';
import { AIController } from './ai.controller';
import { authGuard } from '../../middleware/auth.guard';

export async function aiRoutes(server: FastifyInstance) {
  // GET /api/v1/ai/status (Protected - any authenticated user can view AI provider status)
  server.get(
    '/status',
    {
      preHandler: [authGuard],
    },
    AIController.getStatus
  );
}
