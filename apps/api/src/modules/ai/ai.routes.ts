import { FastifyInstance, FastifyRequest } from 'fastify';
import { AIController } from './ai.controller';
import { authGuard } from '../../middleware/auth.guard';
import { roleGuard } from '../../middleware/role.guard';
import { UserRole } from '@devpilot/shared';

/**
 * Route-level rate limit configuration for AI generation endpoints:
 * 10 requests per minute, scoped to the individual user ID.
 */
const aiGenerationRateLimit = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (req: FastifyRequest) => (req as any).user?.id || req.ip,
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'AI generation rate limit exceeded. You may generate at most 10 items per minute.',
    code: 'RATE_LIMIT_EXCEEDED',
  }),
};

export async function aiRoutes(server: FastifyInstance) {
  // GET /api/v1/ai/status (Protected - any authenticated user can view AI provider status)
  server.get(
    '/status',
    {
      preHandler: [authGuard],
    },
    AIController.getStatus
  );

  // POST /api/v1/ai/generate/ideas
  server.post(
    '/generate/ideas',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
      config: {
        rateLimit: aiGenerationRateLimit,
      },
    },
    AIController.generateIdeas
  );

  // POST /api/v1/ai/generate/caption
  server.post(
    '/generate/caption',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
      config: {
        rateLimit: aiGenerationRateLimit,
      },
    },
    AIController.generateCaption
  );

  // POST /api/v1/ai/generate/hooks
  server.post(
    '/generate/hooks',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
      config: {
        rateLimit: aiGenerationRateLimit,
      },
    },
    AIController.generateHooks
  );

  // POST /api/v1/ai/generate/hashtags
  server.post(
    '/generate/hashtags',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
      config: {
        rateLimit: aiGenerationRateLimit,
      },
    },
    AIController.generateHashtags
  );

  // POST /api/v1/ai/generate/cta
  server.post(
    '/generate/cta',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
      config: {
        rateLimit: aiGenerationRateLimit,
      },
    },
    AIController.generateCta
  );

  // POST /api/v1/ai/generate/rewrite
  server.post(
    '/generate/rewrite',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
      config: {
        rateLimit: aiGenerationRateLimit,
      },
    },
    AIController.generateRewrite
  );

  // POST /api/v1/ai/generate/carousel
  server.post(
    '/generate/carousel',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
      config: {
        rateLimit: aiGenerationRateLimit,
      },
    },
    AIController.generateCarousel
  );

  // POST /api/v1/ai/engine/reset (Privileged - OWNER & ADMIN only)
  server.post(
    '/engine/reset',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN),
      ],
    },
    AIController.resetEngine
  );

  // ==========================================
  // GENERATION HISTORY ROUTES (M2.2.2.2)
  // ==========================================

  // GET /api/v1/ai/history (List history - OWNER, ADMIN, EDITOR, APPROVER)
  server.get(
    '/history',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
    },
    AIController.listHistory
  );

  // GET /api/v1/ai/history/:id (Get single history record)
  server.get(
    '/history/:id',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
    },
    AIController.getHistory
  );

  // DELETE /api/v1/ai/history/:id (Delete single history record)
  server.delete(
    '/history/:id',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR, UserRole.APPROVER),
      ],
    },
    AIController.deleteHistory
  );

  // ==========================================
  // SAVE-TO-DRAFT ROUTE (M2.2.2.3)
  // ==========================================

  // POST /api/v1/ai/history/:id/save-to-draft (OWNER, ADMIN, EDITOR only)
  server.post(
    '/history/:id/save-to-draft',
    {
      preHandler: [
        authGuard,
        roleGuard(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR),
      ],
    },
    AIController.saveToDraft
  );
}
