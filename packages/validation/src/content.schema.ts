import { z } from 'zod';
import { ContentType, ContentCategory, PostStatus } from '@devpilot/shared';

export const createContentSchema = z.object({
  title: z.string().trim().min(3, { message: 'Title must be at least 3 characters' }).max(200),
  caption: z.string().trim().min(5, { message: 'Caption must be at least 5 characters' }).max(10000, { message: 'Caption must not exceed 10000 characters' }),
  hashtags: z.array(z.string().trim().max(100).regex(/^#[a-zA-Z0-9_]+$/, { message: 'Hashtag must start with # and contain no spaces' })).max(30).default([]),
  cta: z.string().trim().max(300).optional().nullable(),
  contentType: z.nativeEnum(ContentType).default(ContentType.SINGLE_IMAGE),
  category: z.nativeEnum(ContentCategory).default(ContentCategory.WEB_DEV_TIPS),
  mediaAssetIds: z.array(z.string().uuid()).max(10).default([]),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const updateContentSchema = createContentSchema.partial().extend({
  status: z.nativeEnum(PostStatus).optional(),
});

export const contentQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.nativeEnum(PostStatus).optional(),
  contentType: z.nativeEnum(ContentType).optional(),
  category: z.nativeEnum(ContentCategory).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'scheduledAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type ContentQueryInput = z.infer<typeof contentQuerySchema>;
