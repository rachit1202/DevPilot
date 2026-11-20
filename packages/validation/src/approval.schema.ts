import { z } from 'zod';
import { ApprovalStatus } from '@devpilot/shared';

export const submitApprovalSchema = z.object({
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const reviewApprovalSchema = z.object({
  status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.CHANGES_REQUESTED]),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export type SubmitApprovalInput = z.infer<typeof submitApprovalSchema>;
export type ReviewApprovalInput = z.infer<typeof reviewApprovalSchema>;
