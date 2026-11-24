import { z } from 'zod';
import { ApprovalStatus, ContentType, ContentCategory } from '@devpilot/shared';

export const submitApprovalSchema = z.object({
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const reviewApprovalSchema = z.object({
  status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.CHANGES_REQUESTED]),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const approvalQuerySchema = z.object({
  tab: z.enum(['pending', 'history']).default('pending'),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ALL']).optional(),
  search: z.string().trim().max(100).optional(),
  contentType: z.nativeEnum(ContentType).optional(),
  category: z.nativeEnum(ContentCategory).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  sortBy: z.enum(['createdAt', 'reviewedAt', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type SubmitApprovalInput = z.infer<typeof submitApprovalSchema>;
export type ReviewApprovalInput = z.infer<typeof reviewApprovalSchema>;
export type ApprovalQueryInput = z.infer<typeof approvalQuerySchema>;

