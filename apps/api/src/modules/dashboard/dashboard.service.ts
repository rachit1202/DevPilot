import { prisma } from '../../db/prisma';
import { PostStatus } from '@devpilot/shared';
import { AuthUser } from '../../types/fastify';

export class DashboardService {
  /**
   * Retrieves real database-backed aggregate metrics for the dashboard.
   * Efficiently aggregates counts, upcoming schedules, and recent audit activity.
   */
  static async getSummary(_user: AuthUser) {
    const now = new Date();

    // 1. Parallel execution of count aggregations
    const [
      statusGroup,
      totalMedia,
      upcomingSchedules,
      recentActivity,
      recentPosts,
    ] = await Promise.all([
      prisma.contentPost.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.mediaAsset.count(),
      prisma.contentSchedule.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { gte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: {
          contentPost: {
            select: {
              id: true,
              title: true,
              caption: true,
              contentType: true,
              category: true,
              status: true,
              mediaItems: {
                include: { mediaAsset: true },
                orderBy: { position: 'asc' },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
        },
      }),
      prisma.contentPost.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          mediaItems: {
            include: { mediaAsset: true },
            orderBy: { position: 'asc' },
            take: 1,
          },
          createdBy: {
            select: { id: true, name: true, role: true },
          },
        },
      }),
    ]);

    // 2. Map status counts into structured metrics object
    const statusMap: Record<string, number> = {};
    let totalPosts = 0;

    for (const item of statusGroup) {
      statusMap[item.status] = item._count.id;
      totalPosts += item._count.id;
    }

    const metrics = {
      totalPosts,
      draftPosts: statusMap[PostStatus.DRAFT] || 0,
      inReviewPosts: statusMap[PostStatus.IN_REVIEW] || 0,
      approvedPosts: statusMap[PostStatus.APPROVED] || 0,
      scheduledPosts: statusMap[PostStatus.SCHEDULED] || 0,
      publishedPosts: statusMap[PostStatus.PUBLISHED] || 0,
      rejectedPosts: statusMap[PostStatus.REJECTED] || 0,
      ideaPosts: statusMap[PostStatus.IDEA] || 0,
      totalMedia,
    };

    return {
      metrics,
      upcomingSchedules: upcomingSchedules.map((s) => ({
        id: s.id,
        scheduledAt: s.scheduledAt.toISOString(),
        status: s.status,
        contentPost: {
          id: s.contentPost.id,
          title: s.contentPost.title,
          caption: s.contentPost.caption,
          contentType: s.contentPost.contentType,
          category: s.contentPost.category,
          status: s.contentPost.status,
          mediaThumbnail: s.contentPost.mediaItems[0]?.mediaAsset?.filePath || null,
        },
      })),
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
        userName: a.user?.name || 'System',
        userRole: a.user?.role || null,
      })),
      recentPosts: recentPosts.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        contentType: p.contentType,
        category: p.category,
        createdAt: p.createdAt.toISOString(),
        creatorName: p.createdBy.name,
        creatorRole: p.createdBy.role,
        mediaThumbnail: p.mediaItems[0]?.mediaAsset?.filePath || null,
      })),
    };
  }
}
