import { z } from 'zod';

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

export const updateApplicationSettingsSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1, 'Timezone is required')
    .refine(isValidTimezone, { message: 'Invalid IANA time zone identifier (e.g. Asia/Kolkata)' })
    .optional(),
  defaultLanguage: z.string().trim().min(2, 'Language code must be at least 2 characters').max(10).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  dateFormat: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']).optional(),
  firstDayOfWeek: z.union([z.literal(0), z.literal(1)]).optional(),
  defaultView: z.enum(['month', 'week', 'day', 'list']).optional(),
});

export type UpdateApplicationSettingsInput = z.infer<typeof updateApplicationSettingsSchema>;
