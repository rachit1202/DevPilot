import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { AIHistoryQueryInput, SaveToDraftInput } from '@devpilot/validation';
import { AuthUser } from '../../types/fastify';
import { UserRole, AIGenerationType, Prisma, ContentType, ContentCategory, PostStatus } from '@prisma/client';

export class HistoryService {
  /**
   * Lists generation history records adhering to the frozen 5-role RBAC matrix.
   * Default: strictly scoped to currentUser.id.
   * Cross-user: OWNER and ADMIN only, via allUsers=true OR targetUserId.
   */
  static async listHistory(query: AIHistoryQueryInput, user: AuthUser) {
    if (user.role === UserRole.ANALYST) {
      const err: any = new Error('FORBIDDEN: Analysts have read-only permissions and cannot access AI generation history.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const hasAllUsers = query.allUsers === true;
    const hasTargetUser = Boolean(query.targetUserId);

    // Conflict validation: cannot specify both allUsers=true and targetUserId
    if (hasAllUsers && hasTargetUser) {
      const err: any = new Error('INVALID_SCOPE_PARAMETERS: Specify either allUsers or targetUserId, not both.');
      err.statusCode = 400;
      err.code = 'INVALID_SCOPE_PARAMETERS';
      throw err;
    }

    // Role check for administrative cross-user scopes
    if ((hasAllUsers || hasTargetUser) && user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      const err: any = new Error('FORBIDDEN: Cross-user history access requires Owner or Admin role.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Verify targetUser exists if targetUserId provided
    if (hasTargetUser && query.targetUserId) {
      const targetExists = await prisma.user.findUnique({
        where: { id: query.targetUserId },
        select: { id: true },
      });
      if (!targetExists) {
        const err: any = new Error('USER_NOT_FOUND: The requested target user does not exist.');
        err.statusCode = 404;
        err.code = 'USER_NOT_FOUND';
        throw err;
      }
    }

    // Determine query scope
    const where: Prisma.GenerationHistoryWhereInput = {};

    if (hasAllUsers) {
      // All users (Owner/Admin only)
    } else if (hasTargetUser) {
      where.userId = query.targetUserId;
    } else {
      // Default: own history
      where.userId = user.id;
    }

    // Optional filters
    if (query.generationType) {
      where.generationType = query.generationType as AIGenerationType;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const [total, records] = await Promise.all([
      prisma.generationHistory.count({ where }),
      prisma.generationHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          generationType: true,
          inputPayload: true,
          outputPayload: true,
          model: true,
          durationMs: true,
          userId: true,
          resultingPostId: true,
          createdAt: true,
        },
      }),
    ]);

    // Asynchronous audit logging for cross-user reads (post-query)
    if (hasAllUsers || hasTargetUser) {
      try {
        await ActivityService.log({
          userId: user.id,
          action: 'AI_HISTORY_CROSS_USER_READ',
          entityType: 'AI_GENERATION_HISTORY',
          metadata: {
            actorUserId: user.id,
            actorRole: user.role,
            allUsers: hasAllUsers,
            targetUserId: query.targetUserId || null,
            resultCount: records.length,
          },
        });
      } catch (logErr) {
        console.error('Failed to log AI_HISTORY_CROSS_USER_READ audit event:', logErr);
      }
    }

    return {
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single generation history record by ID.
   */
  static async getHistory(id: string, user: AuthUser) {
    if (user.role === UserRole.ANALYST) {
      const err: any = new Error('FORBIDDEN: Analysts have read-only permissions and cannot access AI generation history.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const record = await prisma.generationHistory.findUnique({
      where: { id },
      select: {
        id: true,
        generationType: true,
        inputPayload: true,
        outputPayload: true,
        model: true,
        durationMs: true,
        userId: true,
        resultingPostId: true,
        createdAt: true,
      },
    });

    if (!record) {
      const err: any = new Error('HISTORY_NOT_FOUND: Generation history record not found.');
      err.statusCode = 404;
      err.code = 'HISTORY_NOT_FOUND';
      throw err;
    }

    const isOwnerOrAdmin = user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
    const isOwnRecord = record.userId === user.id;

    if (!isOwnRecord && !isOwnerOrAdmin) {
      // Non-admin trying to read another's record: return 404 to avoid leaking existence
      const err: any = new Error('HISTORY_NOT_FOUND: Generation history record not found.');
      err.statusCode = 404;
      err.code = 'HISTORY_NOT_FOUND';
      throw err;
    }

    // Cross-user read audit for Owner/Admin
    if (!isOwnRecord && isOwnerOrAdmin) {
      try {
        await ActivityService.log({
          userId: user.id,
          action: 'AI_HISTORY_CROSS_USER_READ',
          entityType: 'AI_GENERATION_HISTORY',
          entityId: record.id,
          metadata: {
            actorUserId: user.id,
            actorRole: user.role,
            targetUserId: record.userId,
            recordId: record.id,
          },
        });
      } catch (logErr) {
        console.error('Failed to log AI_HISTORY_CROSS_USER_READ audit event:', logErr);
      }
    }

    return {
      success: true,
      data: record,
    };
  }

  /**
   * Deletes a generation history record.
   * If deleting another's record (Owner/Admin only), deletion and audit log are atomic in a transaction.
   * Deleting history does NOT delete any linked ContentPost.
   */
  static async deleteHistory(id: string, user: AuthUser) {
    if (user.role === UserRole.ANALYST) {
      const err: any = new Error('FORBIDDEN: Analysts have read-only permissions and cannot delete AI generation history.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const record = await prisma.generationHistory.findUnique({
      where: { id },
      select: { id: true, userId: true, generationType: true },
    });

    if (!record) {
      const err: any = new Error('HISTORY_NOT_FOUND: Generation history record not found.');
      err.statusCode = 404;
      err.code = 'HISTORY_NOT_FOUND';
      throw err;
    }

    const isOwnerOrAdmin = user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
    const isOwnRecord = record.userId === user.id;

    if (!isOwnRecord && !isOwnerOrAdmin) {
      const err: any = new Error('HISTORY_NOT_FOUND: Generation history record not found.');
      err.statusCode = 404;
      err.code = 'HISTORY_NOT_FOUND';
      throw err;
    }

    if (isOwnRecord) {
      // Deleting own record
      await prisma.generationHistory.delete({
        where: { id },
      });

      return {
        success: true,
        message: 'Generation history record deleted successfully.',
      };
    }

    // Cross-user deletion by Owner or Admin: MUST be atomic with audit event
    return await prisma.$transaction(async (tx) => {
      // Delete the record
      await tx.generationHistory.delete({
        where: { id },
      });

      // Write mandatory audit log
      const auditResult = await ActivityService.log({
        tx,
        userId: user.id,
        action: 'AI_HISTORY_CROSS_USER_DELETE',
        entityType: 'AI_GENERATION_HISTORY',
        entityId: id,
        metadata: {
          actorUserId: user.id,
          actorRole: user.role,
          targetUserId: record.userId,
          deletedRecordId: id,
          generationType: record.generationType,
        },
      });

      if (!auditResult) {
        throw new Error('AUDIT_WRITE_FAILED: Failed to record cross-user deletion audit event.');
      }

      return {
        success: true,
        message: 'Generation history record deleted successfully under administrative scope.',
      };
    });
  }

  /**
   * Promotes a generation history record into a ContentPost (Save-to-Draft).
   * Strict invariants:
   * - Executed inside an interactive Prisma transaction.
   * - Row-level exclusive lock on GenerationHistory via parameterized SELECT ... FOR UPDATE.
   * - Strict ownership: only original creator (user.id === history.user_id) can promote, even for OWNER/ADMIN.
   * - Re-promotion: permitted only when resulting_post_id is NULL.
   * - 6-type mapping: CAPTION, IDEAS, REWRITE, HOOKS supported; CTA and HASHTAGS rejected with 422.
   * - ActivityLog: CONTENT_DRAFT_CREATED_FROM_AI written in same tx.
   */
  static async saveToDraft(id: string, input: SaveToDraftInput, user: AuthUser) {
    if (user.role === UserRole.APPROVER || user.role === UserRole.ANALYST) {
      const err: any = new Error('FORBIDDEN: You do not have permission to create drafts.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Acquire PostgreSQL row-level lock on the GenerationHistory row
      const rows: Array<{
        id: string;
        user_id: string;
        generation_type: AIGenerationType;
        input_payload: any;
        output_payload: any;
        resulting_post_id: string | null;
      }> = await tx.$queryRaw`
        SELECT id, user_id, generation_type, input_payload, output_payload, resulting_post_id
        FROM generation_histories
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        const err: any = new Error('HISTORY_RECORD_NOT_FOUND: Generation history record not found.');
        err.statusCode = 404;
        err.code = 'HISTORY_RECORD_NOT_FOUND';
        throw err;
      }

      const history = rows[0];

      // 2. Strict ownership check (applies to ALL roles including OWNER and ADMIN)
      if (history.user_id !== user.id) {
        const err: any = new Error('CROSS_USER_PROMOTION_FORBIDDEN: Cannot promote generation history owned by another user.');
        err.statusCode = 403;
        err.code = 'CROSS_USER_PROMOTION_FORBIDDEN';
        throw err;
      }

      // 3. Reject already promoted history (must be NULL)
      if (history.resulting_post_id !== null) {
        const err: any = new Error('DRAFT_ALREADY_EXISTS: A draft has already been created from this generation history.');
        err.statusCode = 409;
        err.code = 'DRAFT_ALREADY_EXISTS';
        throw err;
      }

      // 4. Reject unsupported generation types
      if (history.generation_type === AIGenerationType.CTA || history.generation_type === AIGenerationType.HASHTAGS) {
        const err: any = new Error('SAVE_TO_DRAFT_UNSUPPORTED: Direct Save-to-Draft is not supported for CTA and HASHTAGS generations.');
        err.statusCode = 422;
        err.code = 'SAVE_TO_DRAFT_UNSUPPORTED';
        throw err;
      }

      // 5. Field extraction and validation according to frozen mappings
      const output = history.output_payload as any;
      if (!output || typeof output !== 'object') {
        const err: any = new Error('VALIDATION_ERROR: Persisted generation output is invalid or malformed.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      let finalTitle = '';
      let finalCaption = '';
      let finalHashtags: string[] = [];
      let finalCta: string | null = null;
      let finalContentType: ContentType = ContentType.SINGLE_IMAGE;
      const finalCategory: ContentCategory = ContentCategory.WEB_DEV_TIPS;

      switch (history.generation_type) {
        case AIGenerationType.CAPTION: {
          if (!output.title || !output.caption) {
            const err: any = new Error('VALIDATION_ERROR: Persisted caption output is missing required fields.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }
          finalTitle = String(output.title).trim();
          const hook = output.hook ? String(output.hook).trim() : '';
          const captionText = String(output.caption).trim();
          finalCaption = hook ? `${hook}\n\n${captionText}` : captionText;
          finalHashtags = Array.isArray(output.hashtags) ? output.hashtags : [];
          finalCta = output.cta ? String(output.cta).trim() : null;
          break;
        }

        case AIGenerationType.IDEAS: {
          if (
            input.selectedIdeaIndex === undefined ||
            input.selectedIdeaIndex === null ||
            typeof input.selectedIdeaIndex !== 'number' ||
            input.selectedIdeaIndex < 0 ||
            input.selectedIdeaIndex > 2
          ) {
            const err: any = new Error('VALIDATION_ERROR: selectedIdeaIndex must be an integer between 0 and 2 for IDEAS generation.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }

          if (!Array.isArray(output.ideas) || !output.ideas[input.selectedIdeaIndex]) {
            const err: any = new Error('VALIDATION_ERROR: Selected idea does not exist in persisted generation output.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }

          const selectedIdea = output.ideas[input.selectedIdeaIndex];
          finalTitle = String(selectedIdea.title || '').trim();
          finalCaption = String(selectedIdea.concept || '').trim();
          finalHashtags = [];
          finalCta = null;

          if (selectedIdea.suggestedFormat) {
            const fmt = String(selectedIdea.suggestedFormat).toUpperCase().trim();
            if (Object.values(ContentType).includes(fmt as ContentType)) {
              finalContentType = fmt as ContentType;
            } else if (fmt === 'POST' || fmt === 'IMAGE') {
              finalContentType = ContentType.SINGLE_IMAGE;
            } else if (fmt === 'CAROUSEL') {
              finalContentType = ContentType.CAROUSEL;
            } else if (fmt === 'REEL' || fmt === 'VIDEO') {
              finalContentType = ContentType.REEL;
            } else if (fmt === 'STORY') {
              finalContentType = ContentType.STORY;
            }
          }
          break;
        }

        case AIGenerationType.REWRITE: {
          if (!input.title || typeof input.title !== 'string' || input.title.trim().length < 3) {
            const err: any = new Error('VALIDATION_ERROR: A valid title of at least 3 characters is required for REWRITE promotion.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }

          if (!output.rewrittenText) {
            const err: any = new Error('VALIDATION_ERROR: Persisted rewrite output is missing rewrittenText.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }

          finalTitle = input.title.trim();
          finalCaption = String(output.rewrittenText).trim();
          finalHashtags = [];
          finalCta = null;
          break;
        }

        case AIGenerationType.HOOKS: {
          if (
            input.selectedHookIndex === undefined ||
            input.selectedHookIndex === null ||
            typeof input.selectedHookIndex !== 'number' ||
            input.selectedHookIndex < 0 ||
            input.selectedHookIndex > 4
          ) {
            const err: any = new Error('VALIDATION_ERROR: selectedHookIndex must be an integer between 0 and 4 for HOOKS generation.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }

          if (!input.title || typeof input.title !== 'string' || input.title.trim().length < 3) {
            const err: any = new Error('VALIDATION_ERROR: A valid title of at least 3 characters is required for HOOKS promotion.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }

          if (!input.caption || typeof input.caption !== 'string' || input.caption.trim().length < 5) {
            const err: any = new Error('VALIDATION_ERROR: A valid caption of at least 5 characters is required for HOOKS promotion.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }

          if (!Array.isArray(output.hooks) || !output.hooks[input.selectedHookIndex]) {
            const err: any = new Error('VALIDATION_ERROR: Selected hook does not exist in persisted generation output.');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }

          const selectedHook = String(output.hooks[input.selectedHookIndex]).trim();
          const userCaption = input.caption.trim();

          finalTitle = input.title.trim();
          finalCaption = `${selectedHook}\n\n${userCaption}`;
          finalHashtags = [];
          finalCta = null;
          break;
        }

        default: {
          const err: any = new Error('SAVE_TO_DRAFT_UNSUPPORTED: Unsupported generation type.');
          err.statusCode = 422;
          err.code = 'SAVE_TO_DRAFT_UNSUPPORTED';
          throw err;
        }
      }

      // Validate assembled title & caption against ContentPost schema constraints
      if (finalTitle.length < 3 || finalTitle.length > 200) {
        const err: any = new Error(`VALIDATION_ERROR: Post title must be between 3 and 200 characters (got ${finalTitle.length}).`);
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      if (finalCaption.length < 5 || finalCaption.length > 10000) {
        const err: any = new Error(`VALIDATION_ERROR: Post caption must be between 5 and 10000 characters (got ${finalCaption.length}).`);
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      // 6. Resolve BrandSettings record
      const brand = await tx.brandSettings.findFirst({
        select: { id: true },
      });

      if (!brand) {
        const err: any = new Error('BRAND_NOT_FOUND: Brand settings record not found.');
        err.statusCode = 500;
        err.code = 'BRAND_NOT_FOUND';
        throw err;
      }

      // 7. Create ContentPost
      const post = await tx.contentPost.create({
        data: {
          title: finalTitle,
          caption: finalCaption,
          hashtags: finalHashtags,
          cta: finalCta,
          contentType: finalContentType,
          category: finalCategory,
          status: PostStatus.DRAFT,
          sourceType: 'AI_GENERATED',
          createdById: user.id,
          brandSettingsId: brand.id,
        },
      });

      // 8. Update GenerationHistory.resultingPostId
      await tx.generationHistory.update({
        where: { id: history.id },
        data: { resultingPostId: post.id },
      });

      // 9. Mandatory ActivityLog insertion in the same transaction
      const auditResult = await ActivityService.log({
        tx,
        userId: user.id,
        action: 'CONTENT_DRAFT_CREATED_FROM_AI',
        entityType: 'CONTENT_POST',
        entityId: post.id,
        metadata: {
          historyId: history.id,
          generationType: history.generation_type,
          createdPostId: post.id,
          contentType: post.contentType,
        },
      });

      if (!auditResult) {
        throw new Error('AUDIT_WRITE_FAILED: Failed to record draft creation audit event.');
      }

      return {
        post: {
          id: post.id,
          title: post.title,
          caption: post.caption,
          hashtags: post.hashtags,
          cta: post.cta,
          status: post.status,
          contentType: post.contentType,
          category: post.category,
          sourceType: post.sourceType,
          createdById: post.createdById,
          createdAt: post.createdAt,
        },
        history: {
          id: history.id,
          resultingPostId: post.id,
        },
      };
    });
  }
}
