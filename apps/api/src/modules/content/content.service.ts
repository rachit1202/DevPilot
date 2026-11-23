import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { CreateContentInput, UpdateContentInput, ContentQueryInput } from '@devpilot/validation';
import { PostStatus, ApprovalStatus, UserRole, Prisma } from '@prisma/client';
import { AuthUser } from '../../types/fastify';

export class ContentService {
  /**
   * Helper to fetch CodeCulture brand settings.
   */
  private static async getCodeCultureBrandId(): Promise<string> {
    const brand = await prisma.brandSettings.findFirst({
      select: { id: true },
    });

    if (!brand) {
      throw new Error('BRAND_NOT_FOUND: CodeCulture brand settings record is missing. Please run database seed.');
    }
    return brand.id;
  }

  /**
   * Creates a new content post belonging to CodeCulture, linking any specified media assets atomically.
   * Analysts have read-only permissions and are forbidden from creating content.
   */
  static async createContent(input: CreateContentInput, user: AuthUser) {
    if (user.role === UserRole.ANALYST) {
      throw new Error('FORBIDDEN: Analysts have read-only access and cannot create content.');
    }

    const brandSettingsId = await this.getCodeCultureBrandId();

    // Verify all specified media assets exist before creating post
    if (input.mediaAssetIds && input.mediaAssetIds.length > 0) {
      const existingAssets = await prisma.mediaAsset.findMany({
        where: { id: { in: input.mediaAssetIds } },
        select: { id: true },
      });

      if (existingAssets.length !== input.mediaAssetIds.length) {
        throw new Error('MEDIA_NOT_FOUND: One or more referenced media assets do not exist.');
      }
    }

    return await prisma.$transaction(async (tx) => {
      const post = await tx.contentPost.create({
        data: {
          title: input.title,
          caption: input.caption,
          hashtags: input.hashtags || [],
          cta: input.cta || null,
          contentType: input.contentType,
          category: input.category,
          status: PostStatus.DRAFT,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          createdById: user.id,
          brandSettingsId,
        },
      });

      // Link media assets with preserved ordering
      if (input.mediaAssetIds && input.mediaAssetIds.length > 0) {
        await tx.contentMedia.createMany({
          data: input.mediaAssetIds.map((mediaAssetId, index) => ({
            contentPostId: post.id,
            mediaAssetId,
            position: index,
          })),
        });
      }

      await ActivityService.log({
        tx,
        userId: user.id,
        action: 'CONTENT_CREATED',
        entityType: 'CONTENT_POST',
        entityId: post.id,
        metadata: {
          title: post.title,
          contentType: post.contentType,
          category: post.category,
          mediaCount: input.mediaAssetIds?.length || 0,
        },
      });

      return await tx.contentPost.findUnique({
        where: { id: post.id },
        include: {
          mediaItems: {
            include: { mediaAsset: true },
            orderBy: { position: 'asc' },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });
    });
  }

  /**
   * Lists content posts with search, status/type filters, pagination, and sorting.
   */
  static async listContent(query: ContentQueryInput) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.ContentPostWhereInput = {};

    // Search filter across title and caption
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { caption: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Exact filters
    if (query.status) {
      where.status = query.status;
    }
    if (query.contentType) {
      where.contentType = query.contentType;
    }
    if (query.category) {
      where.category = query.category;
    }

    const orderBy: Prisma.ContentPostOrderByWithRelationInput = {
      [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
    };

    const [total, posts] = await Promise.all([
      prisma.contentPost.count({ where }),
      prisma.contentPost.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          mediaItems: {
            include: { mediaAsset: true },
            orderBy: { position: 'asc' },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          approvals: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              reviewedBy: {
                select: { id: true, name: true, role: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      posts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves a single content post with full media, author, and approval details.
   */
  static async getContentById(id: string) {
    return await prisma.contentPost.findUnique({
      where: { id },
      include: {
        mediaItems: {
          include: { mediaAsset: true },
          orderBy: { position: 'asc' },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        brandSettings: {
          select: { id: true, brandName: true, tagline: true, primaryColor: true, secondaryColor: true },
        },
        approvals: {
          orderBy: { createdAt: 'desc' },
          include: {
            reviewedBy: {
              select: { id: true, name: true, role: true },
            },
            requestedBy: {
              select: { id: true, name: true, role: true },
            },
          },
        },
      },
    });
  }

  /**
   * Updates an existing content post and synchronizes linked media assets within a transaction.
   * Enforces ownership and approval state-machine invariants:
   * - Analysts are forbidden (read-only).
   * - Editors and Approvers can modify only their own content.
   * - Owners and Admins can modify any content.
   * - Direct status transitions to APPROVED, SCHEDULED, or PUBLISHED are rejected.
   * - Editing an already-approved post invalidates approval and resets status to DRAFT.
   */
  static async updateContent(id: string, input: UpdateContentInput, user: AuthUser) {
    // 1. Ownership & Role Verification
    if (user.role === UserRole.ANALYST) {
      throw new Error('FORBIDDEN: Analysts have read-only access and cannot modify content.');
    }

    const existing = await prisma.contentPost.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        createdById: true,
        caption: true,
        hashtags: true,
        cta: true,
        contentType: true,
        category: true,
      },
    });

    if (!existing) {
      throw new Error('NOT_FOUND: Content post not found.');
    }

    const isOwnerOrAdmin = user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
    if (!isOwnerOrAdmin && existing.createdById !== user.id) {
      throw new Error('FORBIDDEN: You do not have permission to modify content created by another user.');
    }

    // 2. Status Transition Guard: Direct transition to APPROVED, SCHEDULED, or PUBLISHED is forbidden
    if (
      input.status === PostStatus.APPROVED ||
      input.status === PostStatus.SCHEDULED ||
      input.status === PostStatus.PUBLISHED
    ) {
      throw new Error(
        `INVALID_STATUS_TRANSITION: Direct transition to ${input.status} via content update is forbidden. Posts must go through the dedicated approval workflow.`
      );
    }

    // 3. Approval Invalidation Check: Did any content fields change on an already-approved post?
    const hasContentChanged =
      (input.title !== undefined && input.title !== existing.title) ||
      (input.caption !== undefined && input.caption !== existing.caption) ||
      input.hashtags !== undefined ||
      input.cta !== undefined ||
      input.contentType !== undefined ||
      input.category !== undefined ||
      input.mediaAssetIds !== undefined;

    let targetStatus = input.status !== undefined ? input.status : existing.status;
    let approvalInvalidated = false;

    if (existing.status === PostStatus.APPROVED && hasContentChanged) {
      // Revert status to DRAFT to require fresh review
      targetStatus = input.status !== undefined ? input.status : PostStatus.DRAFT;
      approvalInvalidated = true;
    }

    // 4. Verify referenced media assets if updating media
    if (input.mediaAssetIds && input.mediaAssetIds.length > 0) {
      const existingAssets = await prisma.mediaAsset.findMany({
        where: { id: { in: input.mediaAssetIds } },
        select: { id: true },
      });

      if (existingAssets.length !== input.mediaAssetIds.length) {
        throw new Error('MEDIA_NOT_FOUND: One or more referenced media assets do not exist.');
      }
    }

    return await prisma.$transaction(async (tx) => {
      // Re-link media assets if provided
      if (input.mediaAssetIds !== undefined) {
        await tx.contentMedia.deleteMany({
          where: { contentPostId: id },
        });

        if (input.mediaAssetIds.length > 0) {
          await tx.contentMedia.createMany({
            data: input.mediaAssetIds.map((mediaAssetId, index) => ({
              contentPostId: id,
              mediaAssetId,
              position: index,
            })),
          });
        }
      }

      const updateData: Prisma.ContentPostUpdateInput = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.caption !== undefined) updateData.caption = input.caption;
      if (input.hashtags !== undefined) updateData.hashtags = input.hashtags;
      if (input.cta !== undefined) updateData.cta = input.cta;
      if (input.contentType !== undefined) updateData.contentType = input.contentType;
      if (input.category !== undefined) updateData.category = input.category;
      if (targetStatus !== undefined) updateData.status = targetStatus;

      const updated = await tx.contentPost.update({
        where: { id },
        data: updateData,
        include: {
          mediaItems: {
            include: { mediaAsset: true },
            orderBy: { position: 'asc' },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          approvals: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      // Log APPROVAL_INVALIDATED if an approved post was modified
      if (approvalInvalidated) {
        await ActivityService.log({
          tx,
          userId: user.id,
          action: 'APPROVAL_INVALIDATED',
          entityType: 'CONTENT_POST',
          entityId: id,
          metadata: {
            title: updated.title,
            previousStatus: PostStatus.APPROVED,
            newStatus: targetStatus,
            reason: 'Content modified after approval; fresh approval required.',
          },
        });
      }

      await ActivityService.log({
        tx,
        userId: user.id,
        action: 'CONTENT_UPDATED',
        entityType: 'CONTENT_POST',
        entityId: id,
        metadata: {
          title: updated.title,
          status: updated.status,
          updatedFields: Object.keys(input),
          approvalInvalidated,
        },
      });

      return updated;
    });
  }

  /**
   * Approves a content post atomically within a transaction using the Prisma Approval model.
   * Only authorized reviewer roles (OWNER, ADMIN, APPROVER) can approve.
   */
  static async approveContent(id: string, user: AuthUser, comment?: string | null) {
    // 1. Role verification
    const isAuthorizedReviewer =
      user.role === UserRole.OWNER || user.role === UserRole.ADMIN || user.role === UserRole.APPROVER;

    if (!isAuthorizedReviewer) {
      throw new Error('FORBIDDEN: Only authorized reviewers (Owner, Admin, Approver) can approve content.');
    }

    const existing = await prisma.contentPost.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, createdById: true },
    });

    if (!existing) {
      throw new Error('NOT_FOUND: Content post not found.');
    }

    if (existing.status === PostStatus.PUBLISHED || existing.status === PostStatus.ARCHIVED) {
      throw new Error(`INVALID_POST_STATE: Cannot approve a post that is already ${existing.status.toLowerCase()}.`);
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Update post status to APPROVED
      const updatedPost = await tx.contentPost.update({
        where: { id },
        data: { status: PostStatus.APPROVED },
        include: {
          mediaItems: {
            include: { mediaAsset: true },
            orderBy: { position: 'asc' },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      // 2. Create approval record with reviewer and requester
      const approval = await tx.approval.create({
        data: {
          contentPostId: id,
          requestedById: existing.createdById,
          reviewedById: user.id,
          status: ApprovalStatus.APPROVED,
          comment: comment || null,
          reviewedAt: new Date(),
        },
      });

      // 3. Record audit activity
      await ActivityService.log({
        tx,
        userId: user.id,
        action: 'CONTENT_APPROVED',
        entityType: 'CONTENT_POST',
        entityId: id,
        metadata: {
          title: existing.title,
          reviewerRole: user.role,
          comment: comment || null,
          approvalId: approval.id,
        },
      });

      return {
        ...updatedPost,
        approval,
      };
    });
  }

  /**
   * Rejects a content post atomically within a transaction using the Prisma Approval model.
   * Only authorized reviewer roles (OWNER, ADMIN, APPROVER) can reject.
   */
  static async rejectContent(id: string, user: AuthUser, comment?: string | null) {
    // 1. Role verification
    const isAuthorizedReviewer =
      user.role === UserRole.OWNER || user.role === UserRole.ADMIN || user.role === UserRole.APPROVER;

    if (!isAuthorizedReviewer) {
      throw new Error('FORBIDDEN: Only authorized reviewers (Owner, Admin, Approver) can reject content.');
    }

    const existing = await prisma.contentPost.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, createdById: true },
    });

    if (!existing) {
      throw new Error('NOT_FOUND: Content post not found.');
    }

    if (existing.status === PostStatus.PUBLISHED || existing.status === PostStatus.ARCHIVED) {
      throw new Error(`INVALID_POST_STATE: Cannot reject a post that is already ${existing.status.toLowerCase()}.`);
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Update post status to REJECTED
      const updatedPost = await tx.contentPost.update({
        where: { id },
        data: { status: PostStatus.REJECTED },
        include: {
          mediaItems: {
            include: { mediaAsset: true },
            orderBy: { position: 'asc' },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      // 2. Create approval record with REJECTED status
      const approval = await tx.approval.create({
        data: {
          contentPostId: id,
          requestedById: existing.createdById,
          reviewedById: user.id,
          status: ApprovalStatus.REJECTED,
          comment: comment || null,
          reviewedAt: new Date(),
        },
      });

      // 3. Record audit activity
      await ActivityService.log({
        tx,
        userId: user.id,
        action: 'CONTENT_REJECTED',
        entityType: 'CONTENT_POST',
        entityId: id,
        metadata: {
          title: existing.title,
          reviewerRole: user.role,
          comment: comment || null,
          approvalId: approval.id,
        },
      });

      return {
        ...updatedPost,
        approval,
      };
    });
  }

  /**
   * Deletes a content post and its media links atomically.
   * Enforces role and ownership checks:
   * - Analysts are forbidden.
   * - Editors and Approvers can delete only their own posts.
   * - Owners and Admins can delete any post.
   */
  static async deleteContent(id: string, user: AuthUser) {
    if (user.role === UserRole.ANALYST) {
      throw new Error('FORBIDDEN: Analysts have read-only access and cannot delete content.');
    }

    const existing = await prisma.contentPost.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true },
    });

    if (!existing) {
      throw new Error('NOT_FOUND: Content post not found.');
    }

    const isOwnerOrAdmin = user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
    if (!isOwnerOrAdmin && existing.createdById !== user.id) {
      throw new Error('FORBIDDEN: You do not have permission to delete content created by another user.');
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete media association records
      await tx.contentMedia.deleteMany({
        where: { contentPostId: id },
      });

      // 2. Delete approvals for this post if any
      await tx.approval.deleteMany({
        where: { contentPostId: id },
      });

      // 3. Delete content post
      await tx.contentPost.delete({
        where: { id },
      });

      await ActivityService.log({
        tx,
        userId: user.id,
        action: 'CONTENT_DELETED',
        entityType: 'CONTENT_POST',
        entityId: id,
        metadata: {
          title: existing.title,
          deletedById: user.id,
        },
      });
    });

    return { success: true, message: 'Content post deleted successfully' };
  }
}
