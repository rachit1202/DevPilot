import { z } from 'zod';

export const mediaAssetSchema = z.object({
  originalName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  fileSize: z.number().positive().max(150 * 1024 * 1024, { message: 'File size must not exceed 150MB' }),
});

export const mediaQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  mimeType: z.string().trim().max(50).optional(),
});

export type MediaAssetInput = z.infer<typeof mediaAssetSchema>;
export type MediaQueryInput = z.infer<typeof mediaQuerySchema>;
