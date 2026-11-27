import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { AIGenerationType, Prisma } from '@prisma/client';

export interface CreateGenerationHistoryParams {
  generationType: AIGenerationType;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  model: string;
  durationMs: number;
  userId: string;
}

export class GenerationPersistenceService {
  /**
   * Persists a validated generation output record to GenerationHistory.
   * Throws an error with code HISTORY_PERSISTENCE_FAILED if the database insert fails.
   */
  static async persistHistory(params: CreateGenerationHistoryParams): Promise<string> {
    try {
      const record = await prisma.generationHistory.create({
        data: {
          generationType: params.generationType,
          inputPayload: params.inputPayload as Prisma.InputJsonValue,
          outputPayload: params.outputPayload as Prisma.InputJsonValue,
          model: params.model,
          durationMs: params.durationMs,
          userId: params.userId,
        },
        select: { id: true },
      });

      return record.id;
    } catch (dbErr: any) {
      // Structured server-side error log (redacting sensitive fields)
      console.error('[AI_PERSISTENCE_ERROR] Failed to save generation history to database:', {
        generationType: params.generationType,
        model: params.model,
        userId: params.userId,
        error: dbErr.message,
      });

      // Best-effort ActivityLog recording (suppress errors so it never replaces primary error)
      try {
        await ActivityService.log({
          userId: params.userId,
          action: 'AI_HISTORY_PERSISTENCE_FAILED',
          entityType: 'GENERATION_HISTORY',
          metadata: {
            generationType: params.generationType,
            model: params.model,
            errorMessage: dbErr.message,
          },
        });
      } catch (logErr) {
        // Suppress audit log error
      }

      // Throw frozen contract error
      const err: any = new Error(
        'AI generation succeeded but output history could not be persisted. Output discarded.'
      );
      err.code = 'HISTORY_PERSISTENCE_FAILED';
      err.statusCode = 500;
      throw err;
    }
  }
}
