import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../db/prisma';

export interface LogActionParams {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}

export class ActivityService {
  private static client(tx?: Prisma.TransactionClient): PrismaClient | Prisma.TransactionClient {
    return tx || prisma;
  }

  private static sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
    if (!metadata) return {};
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'cookie', 'accessToken', 'DATABASE_URL'];

    for (const [key, value] of Object.entries(metadata)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  static async log(params: LogActionParams) {
    try {
      const db = this.client(params.tx);
      const cleanMetadata = this.sanitizeMetadata(params.metadata);

      return await db.activityLog.create({
        data: {
          userId: params.userId || null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId || null,
          metadata: cleanMetadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      console.error('Failed to write activity log:', err);
      // Non-blocking for primary application flow
      return null;
    }
  }
}
