import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { PostStatus, ApprovalStatus } from '@devpilot/shared';
import { ApprovalQueryInput } from '@devpilot/validation';
import { AuthUser } from '../../types/fastify';

export class ApprovalService {
  /**
   * Retrieves content posts currently awaiting review (status: IN_REVIEW).
   * Supports pagination, keyword search, contentType & category filters.
   */
  static async getPendingApprovals(query: ApprovalQueryInput, _user: AuthUser) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ContentPostWhereInput = {
      status: PostStatus.IN_REVIEW,
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { caption: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.contentType) {
      where.contentType = query.contentType;
    }

    if (query.category) {
      where.category = query.category;
    }

    const orderBy: Prisma.ContentPostOrderByWithRelationInput = {
      [query.sortBy === 'reviewedAt' ? 'createdAt' : query.sortBy || 'createdAt']: query.sortOrder || 'desc',
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
              requestedBy: {
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
   * Retrieves historical approval records (status: APPROVED or REJECTED).
   * Supports pagination, status filtering, search across post title & comments.
   */
  static async getApprovalHistory(query: ApprovalQueryInput, _user: AuthUser) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ApprovalWhereInput = {};

    if (query.status && query.status !== 'ALL') {
      if (query.status === 'APPROVED') {
        where.status = ApprovalStatus.APPROVED;
      } else if (query.status === 'REJECTED') {
        where.status = ApprovalStatus.REJECTED;
      }
    } else {
      where.status = {
        in: [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED],
      };
    }

    if (query.search) {
      where.OR = [
        { comment: { contains: query.search, mode: 'insensitive' } },
        { contentPost: { title: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    if (query.contentType) {
      where.contentPost = {
        ...(where.contentPost as Prisma.ContentPostWhereInput || {}),
        contentType: query.contentType,
      };
    }

    if (query.category) {
      where.contentPost = {
        ...(where.contentPost as Prisma.ContentPostWhereInput || {}),
        category: query.category,
      };
    }

    const orderBy: Prisma.ApprovalOrderByWithRelationInput = {
      [query.sortBy === 'title' ? 'createdAt' : query.sortBy || 'createdAt']: query.sortOrder || 'desc',
    };

    const [total, records] = await Promise.all([
      prisma.approval.count({ where }),
      prisma.approval.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          contentPost: {
            include: {
              mediaItems: {
                include: { mediaAsset: true },
                orderBy: { position: 'asc' },
              },
              createdBy: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
          reviewedBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          requestedBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
    ]);

    return {
      history: records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Returns aggregated statistics for the Approval Center.
   */
  static async getStats() {
    const [pendingCount, approvedCount, rejectedCount, totalPosts] = await Promise.all([
      prisma.contentPost.count({ where: { status: PostStatus.IN_REVIEW } }),
      prisma.approval.count({ where: { status: ApprovalStatus.APPROVED } }),
      prisma.approval.count({ where: { status: ApprovalStatus.REJECTED } }),
      prisma.contentPost.count(),
    ]);

    return {
      pendingCount,
      approvedCount,
      rejectedCount,
      totalPosts,
    };
  }
}
