import { z } from 'zod';

export const updateBrandSchema = z.object({
  brandName: z.string().trim().min(2, 'Brand name must be at least 2 characters').max(100).optional(),
  tagline: z.string().trim().min(2, 'Tagline must be at least 2 characters').max(250).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  websiteUrl: z
    .string()
    .trim()
    .url({ message: 'Must be a valid URL (e.g. https://codeculture.dev)' })
    .optional()
    .nullable()
    .or(z.literal('')),
  logoUrl: z
    .string()
    .trim()
    .url({ message: 'Must be a valid URL' })
    .optional()
    .nullable()
    .or(z.literal('')),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Must be a valid 6-character hex color (e.g. #8B5CF6)' })
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Must be a valid 6-character hex color (e.g. #06B6D4)' })
    .optional(),
  tone: z.string().trim().min(3, 'Tone must be at least 3 characters').max(500).optional(),
  audience: z.string().trim().min(3, 'Audience must be at least 3 characters').max(500).optional(),
  industry: z.string().trim().max(100).optional().nullable(),
  primaryLanguage: z.string().trim().min(2).max(10).optional(),
  guidelines: z.string().trim().max(5000).optional().nullable(),
  topics: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  avoidTopics: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  ctaDefaults: z.string().trim().max(500).optional().nullable(),
});

export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
