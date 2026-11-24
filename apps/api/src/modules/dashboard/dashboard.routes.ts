import { FastifyInstance } from 'fastify';
import { DashboardController } from './dashboard.controller';
import { authGuard } from '../../middleware/auth.guard';

export async function dashboardRoutes(server: FastifyInstance) {
  // GET /dashboard or /dashboard/summary (protected)
  server.get(
    '/',
    {
      preHandler: [authGuard],
    },
    DashboardController.getSummary
  );

  server.get(
    '/summary',
    {
      preHandler: [authGuard],
    },
    DashboardController.getSummary
  );
}
