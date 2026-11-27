import { z } from 'zod';

// ==========================================
// 1. GENERATION INPUT SCHEMAS
// ==========================================

export const generateIdeasInputSchema = z.object({
  topic: z
    .string()
    .min(5, 'Topic must be at least 5 characters.')
    .max(500, 'Topic must not exceed 500 characters.'),
  targetAudience: z.string().max(200).optional(),
  contentType: z.enum(['POST', 'REEL', 'STORY', 'CAROUSEL']).optional(),
});

export const generateCaptionInputSchema = z.object({
  topic: z
    .string()
    .min(5, 'Topic must be at least 5 characters.')
    .max(1000, 'Topic must not exceed 1000 characters.'),
  tone: z.string().max(100).optional(),
  includeHashtags: z.boolean().optional().default(true),
  includeCta: z.boolean().optional().default(true),
});

export const generateHooksInputSchema = z.object({
  topic: z
    .string()
    .min(5, 'Topic must be at least 5 characters.')
    .max(500, 'Topic must not exceed 500 characters.'),
  style: z.string().max(100).optional(),
});

export const generateHashtagsInputSchema = z.object({
  content: z
    .string()
    .min(3, 'Content must be at least 3 characters.')
    .max(300, 'Content must not exceed 300 characters.'),
  limit: z.number().int().min(10).max(25).optional().default(15),
});

export const generateCtaInputSchema = z.object({
  goal: z
    .string()
    .min(5, 'Goal must be at least 5 characters.')
    .max(500, 'Goal must not exceed 500 characters.'),
  platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'X']).optional(),
});

export const generateRewriteInputSchema = z.object({
  text: z
    .string()
    .min(10, 'Text must be at least 10 characters.')
    .max(3000, 'Text must not exceed 3000 characters.'),
  mode: z.enum(['REWRITE', 'SHORTEN', 'EXPAND', 'TONE_ADJUST']).optional().default('REWRITE'),
  targetTone: z.string().max(100).optional(),
});

export const generateCarouselInputSchema = z.object({
  topic: z
    .string()
    .min(5, 'Topic must be at least 5 characters.')
    .max(500, 'Topic must not exceed 500 characters.'),
  tone: z.string().max(100).optional(),
  slidesCount: z.coerce
    .number()
    .int('slidesCount must be an integer')
    .min(5, 'Carousel must have at least 5 slides.')
    .max(10, 'Carousel cannot exceed 10 slides.')
    .default(7),
  targetAudience: z.string().max(200).optional(),
  additionalInstructions: z.string().max(500).optional(),
});

// ==========================================
// 2. MODEL OUTPUT VALIDATION SCHEMAS
// ==========================================

export const ideaItemSchema = z.object({
  title: z.string().min(3).max(200),
  concept: z.string().min(10).max(1000),
  suggestedFormat: z.string().min(2).max(50),
  angle: z.string().min(2).max(100),
});

export const ideasOutputSchema = z.object({
  ideas: z
    .array(ideaItemSchema)
    .length(3, 'Ideas generator must output exactly 3 ideas.'),
});

export const captionOutputSchema = z.object({
  title: z.string().min(3).max(200),
  hook: z.string().min(5).max(300),
  caption: z.string().min(10).max(5000),
  cta: z.string().min(3).max(300),
  hashtags: z
    .array(z.string().regex(/^#[a-zA-Z0-9_]+$/, 'Each hashtag must start with # and be alphanumeric.'))
    .min(1)
    .max(30),
});

export const hooksOutputSchema = z.object({
  hooks: z
    .array(z.string().min(5).max(300))
    .length(5, 'Hooks generator must output exactly 5 hooks.'),
});

export const hashtagsOutputSchema = z.object({
  hashtags: z
    .array(z.string().regex(/^#[a-zA-Z0-9_]+$/, 'Each hashtag must start with # and be alphanumeric.'))
    .min(10, 'Must output at least 10 hashtags.')
    .max(25, 'Must output at most 25 hashtags.'),
});

export const ctaOutputSchema = z.object({
  ctas: z
    .array(z.string().min(5).max(300))
    .length(3, 'CTA generator must output exactly 3 CTAs.'),
});

export const rewriteOutputSchema = z.object({
  rewrittenText: z.string().min(10).max(5000),
  mode: z.string().min(2).max(50),
  targetTone: z.string().min(2).max(100).optional(),
});

export const carouselSlideSchema = z.object({
  slideNumber: z.number().int().min(1).max(10),
  slideType: z.enum(['COVER', 'BODY', 'CTA']),
  title: z.string().min(2, 'Slide title must be at least 2 characters.').max(200),
  content: z.string().min(5, 'Slide content must be at least 5 characters.').max(1000),
  visualDirection: z.string().max(500).optional(),
  hook: z.string().max(300).optional(),
  cta: z.string().max(300).optional(),
});

export const carouselOutputBaseSchema = z.object({
  title: z.string().min(3, 'Carousel title must be at least 3 characters.').max(200),
  topic: z.string().min(5, 'Topic must be at least 5 characters.').max(500),
  targetAudience: z.string().max(200).optional(),
  slides: z
    .array(carouselSlideSchema)
    .min(5, 'Carousel must contain at least 5 slides.')
    .max(10, 'Carousel must contain at most 10 slides.'),
});

/**
 * Creates a validated carousel output schema.
 * Enforces:
 * - F-01: Exact slide count matching expectedSlidesCount (when specified).
 * - F-02: Slide sequence integrity:
 *   * Sequential slide numbers starting at 1 with no duplicates or gaps.
 *   * First slide must have slideType='COVER'.
 *   * Last slide must have slideType='CTA'.
 *   * All intermediate slides must have slideType='BODY'.
 */
export function createCarouselOutputSchema(expectedSlidesCount?: number) {
  return carouselOutputBaseSchema.superRefine((data, ctx) => {
    // F-01: Exact slide count validation
    if (expectedSlidesCount !== undefined && data.slides.length !== expectedSlidesCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Carousel must contain exactly ${expectedSlidesCount} slides (got ${data.slides.length}).`,
        path: ['slides'],
      });
    }

    // F-02: Slide sequence integrity
    if (data.slides.length > 0) {
      // First slide must be COVER
      if (data.slides[0].slideType !== 'COVER') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'First slide must have slideType "COVER".',
          path: ['slides', 0, 'slideType'],
        });
      }

      // Last slide must be CTA
      if (data.slides.length > 1 && data.slides[data.slides.length - 1].slideType !== 'CTA') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Last slide must have slideType "CTA".',
          path: ['slides', data.slides.length - 1, 'slideType'],
        });
      }

      // Intermediate slides must be BODY
      for (let i = 1; i < data.slides.length - 1; i++) {
        if (data.slides[i].slideType !== 'BODY') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Intermediate slide ${i + 1} must have slideType "BODY".`,
            path: ['slides', i, 'slideType'],
          });
        }
      }

      // Slide numbers must be strictly sequential starting at 1
      for (let i = 0; i < data.slides.length; i++) {
        const expectedNum = i + 1;
        if (data.slides[i].slideNumber !== expectedNum) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Slide at position ${i + 1} must have slideNumber ${expectedNum} (got ${data.slides[i].slideNumber}).`,
            path: ['slides', i, 'slideNumber'],
          });
        }
      }
    }
  });
}

export const carouselOutputSchema = createCarouselOutputSchema();

// ==========================================
// 3. ENGINE RESET & STATUS SCHEMAS
// ==========================================

export const aiEngineResetInputSchema = z.object({
  idempotencyKey: z.string().uuid({
    message: 'A valid UUID v4 idempotencyKey is required for engine recovery.',
  }),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must explicitly confirm the reset request.' }),
  }),
  recoveryCondition: z.enum(['INFERENCE_SETTLED', 'OLLAMA_STOPPED'], {
    errorMap: () => ({ message: 'recoveryCondition must be either INFERENCE_SETTLED or OLLAMA_STOPPED.' }),
  }),
  operatorNotes: z
    .string()
    .min(10, 'Operator notes must be at least 10 characters explaining verification.')
    .max(500, 'Operator notes must not exceed 500 characters.'),
});

// ==========================================
// 4. GENERATION HISTORY SCHEMAS
// ==========================================

export const aiHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  generationType: z.enum(['IDEAS', 'CAPTION', 'HOOKS', 'HASHTAGS', 'CTA', 'REWRITE', 'CAROUSEL']).optional(),
  allUsers: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  targetUserId: z.string().uuid({ message: 'targetUserId must be a valid UUID' }).optional(),
  startDate: z.string().datetime({ message: 'startDate must be a valid ISO datetime' }).optional(),
  endDate: z.string().datetime({ message: 'endDate must be a valid ISO datetime' }).optional(),
});

export const aiHistoryParamsSchema = z.object({
  id: z.string().uuid({ message: 'History ID must be a valid UUID' }),
});

export const saveToDraftSchema = z
  .object({
    selectedIdeaIndex: z.number().int().min(0).max(2).optional(),
    selectedHookIndex: z.number().int().min(0).max(4).optional(),
    title: z.string().trim().min(3, { message: 'Title must be at least 3 characters' }).max(200).optional(),
    caption: z.string().trim().min(5, { message: 'Caption must be at least 5 characters' }).max(10000).optional(),
  })
  .strict();

// ==========================================
// 5. INFERRED TYPES
// ==========================================

export type GenerateIdeasInput = z.infer<typeof generateIdeasInputSchema>;
export type GenerateCaptionInput = z.infer<typeof generateCaptionInputSchema>;
export type GenerateHooksInput = z.infer<typeof generateHooksInputSchema>;
export type GenerateHashtagsInput = z.infer<typeof generateHashtagsInputSchema>;
export type GenerateCtaInput = z.infer<typeof generateCtaInputSchema>;
export type GenerateRewriteInput = z.infer<typeof generateRewriteInputSchema>;
export type GenerateCarouselInput = z.infer<typeof generateCarouselInputSchema>;

export type IdeasOutput = z.infer<typeof ideasOutputSchema>;
export type CaptionOutput = z.infer<typeof captionOutputSchema>;
export type HooksOutput = z.infer<typeof hooksOutputSchema>;
export type HashtagsOutput = z.infer<typeof hashtagsOutputSchema>;
export type CtaOutput = z.infer<typeof ctaOutputSchema>;
export type RewriteOutput = z.infer<typeof rewriteOutputSchema>;
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;
export type CarouselOutput = z.infer<typeof carouselOutputSchema>;

export type AIEngineResetInput = z.infer<typeof aiEngineResetInputSchema>;
export type AIHistoryQueryInput = z.infer<typeof aiHistoryQuerySchema>;
export type AIHistoryParamsInput = z.infer<typeof aiHistoryParamsSchema>;
export type SaveToDraftInput = z.infer<typeof saveToDraftSchema>;
