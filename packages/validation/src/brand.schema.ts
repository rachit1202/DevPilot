import { z } from 'zod';

export const updateBrandSchema = z.object({
  brandName: z.string().trim().min(2).max(100),
  tagline: z.string().trim().min(2).max(250),
  websiteUrl: z.string().trim().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Must be a valid hex color (e.g. #8B5CF6)' }),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Must be a valid hex color (e.g. #06B6D4)' }),
  tone: z.string().trim().min(5).max(500),
  audience: z.string().trim().min(5).max(500),
  topics: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  avoidTopics: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  ctaDefaults: z.string().trim().max(500).optional().nullable(),
});

export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
