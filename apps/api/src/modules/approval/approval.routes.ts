import { FastifyInstance } from 'fastify';
import { ApprovalController } from './approval.controller';
import { authGuard } from '../../middleware/auth.guard';
import { roleGuard } from '../../middleware/role.guard';
import { UserRole } from '@devpilot/shared';

export async function approvalRoutes(server: FastifyInstance) {
  // GET /approvals (list pending or history based on ?tab=)
  server.get(
    '/',
    {
      preHandler: [authGuard],
    },
    ApprovalController.list
  );

  // GET /approvals/pending (explicit pending approvals)
  server.get(
    '/pending',
    {
      preHandler: [authGuard],
    },
    ApprovalController.pending
  );

  // GET /approvals/history (explicit approval history)
  server.get(
    '/history',
    {
      preHandler: [authGuard],
    },
    ApprovalController.history
  );

  // GET /approvals/stats (aggregated approval metrics)
  server.get(
    '/stats',
    {
      preHandler: [authGuard],
    },
    ApprovalController.stats
  );

  // POST /approvals/:id/approve (protected, reviewers only)
  server.post(
    '/:id/approve',
    {
      preHandler: [authGuard, roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.APPROVER)],
    },
    ApprovalController.approve
  );

  // POST /approvals/:id/reject (protected, reviewers only)
  server.post(
    '/:id/reject',
    {
      preHandler: [authGuard, roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.APPROVER)],
    },
    ApprovalController.reject
  );
}
