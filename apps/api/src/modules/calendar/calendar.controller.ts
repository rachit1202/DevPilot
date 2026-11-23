import { FastifyReply, FastifyRequest } from 'fastify';
import { CalendarService } from './calendar.service';
import { calendarQuerySchema, schedulePostSchema, reschedulePostSchema } from '@devpilot/validation';
import { AuthUser } from '../../types/fastify';

export class CalendarController {
  static async getCalendar(request: FastifyRequest, reply: FastifyReply) {
    const query = calendarQuerySchema.parse(request.query);

    try {
      const data = await CalendarService.listCalendarEntries(query);
      return reply.status(200).send({
        success: true,
        data,
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith('INVALID_DATE')) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async schedule(request: FastifyRequest, reply: FastifyReply) {
    const input = schedulePostSchema.parse(request.body);
    const user = request.user as AuthUser;

    try {
      const result = await CalendarService.schedulePost(input, user);

      return reply.status(201).send({
        success: true,
        message: 'Content post scheduled successfully',
        data: result,
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith('FORBIDDEN')) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      if (error.message.startsWith('NOT_FOUND')) {
        return reply.status(404).send({
          success: false,
          error: 'Not Found',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      if (
        error.message.startsWith('INVALID_POST_STATUS') ||
        error.message.startsWith('INVALID_APPROVAL') ||
        error.message.startsWith('INVALID_SCHEDULE_DATE') ||
        error.message.startsWith('INVALID_DATE') ||
        error.message.startsWith('NONEXISTENT_LOCAL_TIME')
      ) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      if (error.message.startsWith('DUPLICATE_SCHEDULE')) {
        return reply.status(409).send({
          success: false,
          error: 'Conflict',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async reschedule(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const input = reschedulePostSchema.parse(request.body);
    const user = request.user as AuthUser;

    try {
      const result = await CalendarService.reschedulePost(id, input, user);

      return reply.status(200).send({
        success: true,
        message: 'Content schedule updated successfully',
        data: result,
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith('FORBIDDEN')) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      if (error.message.startsWith('NOT_FOUND')) {
        return reply.status(404).send({
          success: false,
          error: 'Not Found',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      if (
        error.message.startsWith('INVALID_SCHEDULE_STATE') ||
        error.message.startsWith('INVALID_SCHEDULE_DATE') ||
        error.message.startsWith('INVALID_DATE') ||
        error.message.startsWith('NONEXISTENT_LOCAL_TIME')
      ) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async cancel(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const user = request.user as AuthUser;

    try {
      const result = await CalendarService.cancelSchedule(id, user);

      return reply.status(200).send({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith('FORBIDDEN')) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      if (error.message.startsWith('NOT_FOUND')) {
        return reply.status(404).send({
          success: false,
          error: 'Not Found',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }
}
