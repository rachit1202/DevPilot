import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { CalendarQueryInput, SchedulePostInput, ReschedulePostInput } from '@devpilot/validation';
import { PostStatus, ApprovalStatus, UserRole, Prisma } from '@prisma/client';
import { AuthUser } from '../../types/fastify';
import { config } from '../../config/env';

export class CalendarService {
  /**
   * Retrieves calendar entries for a date range with optional filtering by status and contentType.
   */
  static async listCalendarEntries(query: CalendarQueryInput) {
    let startDate = new Date(query.startDate);
    let endDate = new Date(query.endDate);

    if (isNaN(startDate.getTime())) {
      throw new Error('INVALID_DATE: Invalid startDate parameter.');
    }
    if (isNaN(endDate.getTime())) {
      throw new Error('INVALID_DATE: Invalid endDate parameter.');
    }

    // If endDate was supplied as a date-only string (e.g. 2026-11-30), extend to end of day UTC
    if (query.endDate.length === 10) {
      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    }

    const where: Prisma.ContentScheduleWhereInput = {
      scheduledAt: {
        gte: startDate,
        lte: endDate,
      },
      status: 'SCHEDULED', // Only active upcoming schedules for calendar display
    };

    if (query.status || query.contentType) {
      where.contentPost = {};
      if (query.status) {
        where.contentPost.status = query.status;
      }
      if (query.contentType) {
        where.contentPost.contentType = query.contentType;
      }
    }

    const schedules = await prisma.contentSchedule.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: {
        contentPost: {
          include: {
            mediaItems: {
              include: { mediaAsset: true },
              orderBy: { position: 'asc' },
            },
            createdBy: {
              select: { id: true, name: true, role: true },
            },
            approvals: {
              where: { status: ApprovalStatus.APPROVED },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                reviewedBy: {
                  select: { id: true, name: true, role: true },
                },
              },
            },
          },
        },
      },
    });

    return {
      timezone: config.APP_TIMEZONE,
      range: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      total: schedules.length,
      entries: schedules.map((s) => ({
        id: s.id,
        contentPostId: s.contentPostId,
        scheduledAt: s.scheduledAt.toISOString(),
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        post: {
          id: s.contentPost.id,
          title: s.contentPost.title,
          caption: s.contentPost.caption,
          contentType: s.contentPost.contentType,
          category: s.contentPost.category,
          status: s.contentPost.status,
          scheduledAt: s.contentPost.scheduledAt?.toISOString() || null,
          mediaItems: s.contentPost.mediaItems,
          createdBy: s.contentPost.createdBy,
          approval: s.contentPost.approvals[0] || null,
        },
      })),
    };
  }

  /**
   * Schedules an approved content post atomically.
   * Enforces authorization, approved state, valid approval history, future datetime, and duplicate prevention.
   */
  static async schedulePost(input: SchedulePostInput, user: AuthUser) {
    if (user.role === UserRole.ANALYST) {
      throw new Error('FORBIDDEN: Analysts have read-only access and cannot schedule content.');
    }

    const scheduledDate = new Date(input.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new Error('INVALID_DATE: Invalid scheduled date format.');
    }

    if (scheduledDate.getTime() <= Date.now()) {
      throw new Error('INVALID_SCHEDULE_DATE: Scheduled date and time must be in the future.');
    }

    const post = await prisma.contentPost.findUnique({
      where: { id: input.contentPostId },
      include: {
        approvals: {
          where: { status: ApprovalStatus.APPROVED },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!post) {
      throw new Error('NOT_FOUND: Content post not found.');
    }

    // Role ownership check: Editors and Approvers can only schedule their own posts
    const isOwnerOrAdmin = user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
    if (!isOwnerOrAdmin && post.createdById !== user.id) {
      throw new Error('FORBIDDEN: You do not have permission to schedule content created by another user.');
    }

    // Post status invariants:
    if (post.status === PostStatus.DRAFT) {
      throw new Error('INVALID_POST_STATUS: Cannot schedule a draft post. Post must be approved first.');
    }
    if (post.status === PostStatus.IN_REVIEW) {
      throw new Error('INVALID_POST_STATUS: Cannot schedule a post that is in review. Post must be approved first.');
    }
    if (post.status === PostStatus.REJECTED) {
      throw new Error('INVALID_POST_STATUS: Cannot schedule a rejected post. Post must be approved first.');
    }
    if (post.status !== PostStatus.APPROVED) {
      throw new Error(`INVALID_POST_STATUS: Only APPROVED posts can be scheduled. Current status: ${post.status}.`);
    }

    // Approval history invariant
    if (!post.approvals || post.approvals.length === 0) {
      throw new Error('INVALID_APPROVAL: Cannot schedule post without a valid verified approval record.');
    }

    // Prevent duplicate active schedule
    const existingActiveSchedule = await prisma.contentSchedule.findFirst({
      where: { contentPostId: post.id, status: 'SCHEDULED' },
    });
    if (existingActiveSchedule) {
      throw new Error('DUPLICATE_SCHEDULE: Post already has an active schedule. Use reschedule or cancel existing schedule first.');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Create ContentSchedule record
        const schedule = await tx.contentSchedule.create({
          data: {
            contentPostId: post.id,
            scheduledAt: scheduledDate,
            status: 'SCHEDULED',
          },
        });

        // 2. Transition post from APPROVED to SCHEDULED
        const updatedPost = await tx.contentPost.update({
          where: { id: post.id },
          data: {
            status: PostStatus.SCHEDULED,
            scheduledAt: scheduledDate,
          },
          include: {
            mediaItems: {
              include: { mediaAsset: true },
              orderBy: { position: 'asc' },
            },
            createdBy: {
              select: { id: true, name: true, role: true },
            },
          },
        });

        // 3. Log audit activity
        await ActivityService.log({
          tx,
          userId: user.id,
          action: 'CONTENT_SCHEDULED',
          entityType: 'CONTENT_SCHEDULE',
          entityId: schedule.id,
          metadata: {
            contentPostId: post.id,
            title: post.title,
            scheduledAt: schedule.scheduledAt.toISOString(),
            timezone: config.APP_TIMEZONE,
          },
        });

        return {
          schedule,
          post: updatedPost,
        };
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new Error('DUPLICATE_SCHEDULE: Post already has an active schedule. Use reschedule or cancel existing schedule first.');
      }
      throw err;
    }
  }

  /**
   * Reschedules an existing active schedule.
   * Preserves approval validity while updating scheduled date.
   */
  static async reschedulePost(id: string, input: ReschedulePostInput, user: AuthUser) {
    if (user.role === UserRole.ANALYST) {
      throw new Error('FORBIDDEN: Analysts have read-only access and cannot reschedule content.');
    }

    const newScheduledDate = new Date(input.scheduledAt);
    if (isNaN(newScheduledDate.getTime())) {
      throw new Error('INVALID_DATE: Invalid scheduled date format.');
    }

    if (newScheduledDate.getTime() <= Date.now()) {
      throw new Error('INVALID_SCHEDULE_DATE: Rescheduled date and time must be in the future.');
    }

    const schedule = await prisma.contentSchedule.findUnique({
      where: { id },
      include: { contentPost: true },
    });

    if (!schedule) {
      throw new Error('NOT_FOUND: Schedule record not found.');
    }

    const isOwnerOrAdmin = user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
    if (!isOwnerOrAdmin && schedule.contentPost.createdById !== user.id) {
      throw new Error('FORBIDDEN: You do not have permission to reschedule content created by another user.');
    }

    if (schedule.status !== 'SCHEDULED') {
      throw new Error(`INVALID_SCHEDULE_STATE: Cannot reschedule a ${schedule.status.toLowerCase()} schedule.`);
    }

    return await prisma.$transaction(async (tx) => {
      const updatedSchedule = await tx.contentSchedule.update({
        where: { id },
        data: { scheduledAt: newScheduledDate },
      });

      const updatedPost = await tx.contentPost.update({
        where: { id: schedule.contentPostId },
        data: { scheduledAt: newScheduledDate },
        include: {
          mediaItems: {
            include: { mediaAsset: true },
            orderBy: { position: 'asc' },
          },
          createdBy: {
            select: { id: true, name: true, role: true },
          },
        },
      });

      await ActivityService.log({
        tx,
        userId: user.id,
        action: 'CONTENT_RESCHEDULED',
        entityType: 'CONTENT_SCHEDULE',
        entityId: id,
        metadata: {
          contentPostId: schedule.contentPostId,
          title: schedule.contentPost.title,
          previousDate: schedule.scheduledAt.toISOString(),
          newDate: newScheduledDate.toISOString(),
          timezone: config.APP_TIMEZONE,
        },
      });

      return {
        schedule: updatedSchedule,
        post: updatedPost,
      };
    });
  }

  /**
   * Cancels an existing active schedule and returns the post to APPROVED status.
   */
  static async cancelSchedule(id: string, user: AuthUser) {
    if (user.role === UserRole.ANALYST) {
      throw new Error('FORBIDDEN: Analysts have read-only access and cannot cancel schedules.');
    }

    const schedule = await prisma.contentSchedule.findUnique({
      where: { id },
      include: { contentPost: true },
    });

    if (!schedule) {
      throw new Error('NOT_FOUND: Schedule record not found.');
    }

    const isOwnerOrAdmin = user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
    if (!isOwnerOrAdmin && schedule.contentPost.createdById !== user.id) {
      throw new Error('FORBIDDEN: You do not have permission to cancel schedules for content created by another user.');
    }

    // Cancellation is idempotent: if schedule is already CANCELLED, return current state without emitting duplicate activity logs
    if (schedule.status === 'CANCELLED') {
      return {
        success: true,
        message: 'Schedule is already cancelled.',
        schedule,
        post: schedule.contentPost,
      };
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Mark schedule as CANCELLED
      const updatedSchedule = await tx.contentSchedule.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // 2. Return post status to APPROVED and clear scheduledAt if it was SCHEDULED
      let updatedPost = schedule.contentPost;
      if (schedule.contentPost.status === PostStatus.SCHEDULED) {
        updatedPost = await tx.contentPost.update({
          where: { id: schedule.contentPostId },
          data: {
            status: PostStatus.APPROVED,
            scheduledAt: null,
          },
        });
      }

      // 3. Log audit activity
      await ActivityService.log({
        tx,
        userId: user.id,
        action: 'CONTENT_SCHEDULE_CANCELLED',
        entityType: 'CONTENT_SCHEDULE',
        entityId: id,
        metadata: {
          contentPostId: schedule.contentPostId,
          title: schedule.contentPost.title,
          cancelledScheduleDate: schedule.scheduledAt.toISOString(),
        },
      });

      return {
        success: true,
        message: 'Schedule cancelled successfully; post returned to APPROVED status.',
        schedule: updatedSchedule,
        post: updatedPost,
      };
    });
  }
}
