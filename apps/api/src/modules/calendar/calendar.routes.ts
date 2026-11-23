import { FastifyInstance } from 'fastify';
import { CalendarController } from './calendar.controller';
import { authGuard } from '../../middleware/auth.guard';

export async function calendarRoutes(server: FastifyInstance) {
  // GET /calendar (protected, with date range query)
  server.get(
    '/',
    {
      preHandler: [authGuard],
    },
    CalendarController.getCalendar
  );

  // POST /calendar/schedule (protected)
  server.post(
    '/schedule',
    {
      preHandler: [authGuard],
    },
    CalendarController.schedule
  );

  // PATCH /calendar/schedule/:id (protected)
  server.patch(
    '/schedule/:id',
    {
      preHandler: [authGuard],
    },
    CalendarController.reschedule
  );

  // DELETE /calendar/schedule/:id (protected)
  server.delete(
    '/schedule/:id',
    {
      preHandler: [authGuard],
    },
    CalendarController.cancel
  );
}
