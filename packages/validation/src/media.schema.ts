import { z } from 'zod';

export const mediaAssetSchema = z.object({
  originalName: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  fileSize: z.number().positive().max(150 * 1024 * 1024, { message: 'File size must not exceed 150MB' }),
});

export type MediaAssetInput = z.infer<typeof mediaAssetSchema>;
