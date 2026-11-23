import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { CreateContentInput, UpdateContentInput, ContentQueryInput } from '@devpilot/validation';
import { PostStatus, Prisma } from '@prisma/client';

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
   */
  static async createContent(input: CreateContentInput, userId: string) {
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
          createdById: userId,
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
        userId,
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
   * Retrieves a single content post with full media and author details.
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
      },
    });
  }

  /**
   * Updates an existing content post and synchronizes linked media assets within a transaction.
   */
  static async updateContent(id: string, input: UpdateContentInput, userId: string) {
    const existing = await prisma.contentPost.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new Error('NOT_FOUND: Content post not found.');
    }

    // Verify referenced media assets if updating media
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
      if (input.status !== undefined) updateData.status = input.status;
      if (input.scheduledAt !== undefined) {
        updateData.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      }

      // If transitioning to PUBLISHED, stamp publishedAt timestamp
      if (input.status === PostStatus.PUBLISHED) {
        updateData.publishedAt = new Date();
      }

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
        },
      });

      await ActivityService.log({
        tx,
        userId,
        action: 'CONTENT_UPDATED',
        entityType: 'CONTENT_POST',
        entityId: id,
        metadata: {
          title: updated.title,
          status: updated.status,
          updatedFields: Object.keys(input),
        },
      });

      return updated;
    });
  }

  /**
   * Deletes a content post and its media links atomically.
   */
  static async deleteContent(id: string, userId: string) {
    const existing = await prisma.contentPost.findUnique({
      where: { id },
      select: { id: true, title: true },
    });

    if (!existing) {
      throw new Error('NOT_FOUND: Content post not found.');
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
        userId,
        action: 'CONTENT_DELETED',
        entityType: 'CONTENT_POST',
        entityId: id,
        metadata: {
          title: existing.title,
        },
      });
    });

    return { success: true, message: 'Content post deleted successfully' };
  }
}
