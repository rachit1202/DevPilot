import { z } from 'zod';
import { PostStatus, ContentType } from '@devpilot/shared';

export const calendarQuerySchema = z.object({
  startDate: z.string().min(10, { message: 'startDate must be at least 10 characters (YYYY-MM-DD or ISO)' }),
  endDate: z.string().min(10, { message: 'endDate must be at least 10 characters (YYYY-MM-DD or ISO)' }),
  status: z.nativeEnum(PostStatus).optional(),
  contentType: z.nativeEnum(ContentType).optional(),
});

export const schedulePostSchema = z.object({
  contentPostId: z.string().uuid({ message: 'contentPostId must be a valid UUID' }),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'scheduledAt must be a valid ISO datetime string',
  }),
});

export const reschedulePostSchema = z.object({
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'scheduledAt must be a valid ISO datetime string',
  }),
});

export type CalendarQueryInput = z.infer<typeof calendarQuerySchema>;
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;
export type ReschedulePostInput = z.infer<typeof reschedulePostSchema>;
