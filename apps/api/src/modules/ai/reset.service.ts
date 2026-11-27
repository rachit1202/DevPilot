import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { RecoveryMarkerManager } from './recovery.marker';
import { GenerationMutex } from './generation.mutex';
import { ResetMutex } from './reset.mutex';
import { auditAllResetOperations, ActivityLogResetRecord } from './reset.validator';
import { AIEngineResetInput } from '@devpilot/validation';

export class AIEngineResetService {
  /**
   * Executes the 3-stage audited reset transaction with mandatory client-provided idempotency key.
   */
  static async executeReset(input: AIEngineResetInput, userId: string): Promise<{ success: boolean; message: string; data?: any }> {
    const key = input.idempotencyKey;

    // 1. Synchronous Reset Mutex Claim
    const claim = ResetMutex.claim(key);
    if (!claim.acquired) {
      if (claim.reason === 'CONCURRENT_SAME_KEY_IN_PROGRESS') {
        const err: any = new Error('A reset operation with this idempotency key is currently running.');
        err.statusCode = 409;
        err.code = 'RESET_IN_PROGRESS';
        throw err;
      }
      const err: any = new Error('Another reset operation is currently running.');
      err.statusCode = 409;
      err.code = 'CONCURRENT_RESET_BLOCKED';
      throw err;
    }

    try {
      // 2. Reject reset if an active generation is in flight
      if (GenerationMutex.getStatus() === 'GENERATING') {
        const err: any = new Error('Cannot reset AI engine while generation inference is actively running.');
        err.statusCode = 409;
        err.code = 'CANNOT_RESET_ACTIVE_GENERATION';
        throw err;
      }

      // 3. Scan existing reset history for any pending or corrupted operations
      const rawRecords = await prisma.activityLog.findMany({
        where: {
          entityType: 'AI_ENGINE',
          action: { startsWith: 'AI_ENGINE_RESET_' },
        },
        select: {
          id: true,
          entityId: true,
          action: true,
          metadata: true,
          createdAt: true,
        },
      });

      const audit = auditAllResetOperations(rawRecords as ActivityLogResetRecord[]);
      if (!audit.safeToReconcile) {
        const err: any = new Error(`Cannot reset engine: ${audit.diagnosticError}`);
        err.statusCode = 409;
        err.code = 'CORRUPTED_RESET_HISTORY';
        throw err;
      }

      // Check if a DIFFERENT incomplete reset is pending
      if (audit.pendingOperation && audit.pendingOperation.key !== key) {
        const err: any = new Error(`Cannot initiate new reset: previous reset operation with key ${audit.pendingOperation.key} is pending.`);
        err.statusCode = 409;
        err.code = 'RESET_TRANSACTION_PENDING';
        throw err;
      }

      // 4. Inspect existing events for THIS key
      const keyRecords = (rawRecords as ActivityLogResetRecord[]).filter((r) => r.entityId === key);
      const hasAttempted = keyRecords.some((r) => r.action === 'AI_ENGINE_RESET_ATTEMPTED');
      const hasAuthorized = keyRecords.some((r) => r.action === 'AI_ENGINE_RESET_AUTHORIZED');
      const hasCompleted = keyRecords.some((r) => r.action === 'AI_ENGINE_RESET_COMPLETED');

      if (hasCompleted) {
        return {
          success: true,
          message: 'Reset operation already completed.',
          data: { status: 'ALREADY_COMPLETED', idempotencyKey: key },
        };
      }

      // Validate payload invariance if retry
      if (hasAttempted || hasAuthorized) {
        const firstRecord = keyRecords.find((r) => r.action === 'AI_ENGINE_RESET_ATTEMPTED' || r.action === 'AI_ENGINE_RESET_AUTHORIZED');
        const meta = (firstRecord?.metadata as any) || {};
        if (
          meta.recoveryCondition !== input.recoveryCondition ||
          meta.operatorNotes !== input.operatorNotes
        ) {
          const err: any = new Error('Payload mismatch: Cannot alter recovery condition or notes for an existing idempotency key.');
          err.statusCode = 422;
          err.code = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
          throw err;
        }
      }

      // 5. Validate Recovery Condition
      // CRITICAL RECOVERY INVARIANT:
      // An Ollama health check or TCP ping proves only that the daemon is listening;
      // it does NOT prove that a previous timed-out or aborted inference has stopped computing on CPU.
      // Therefore, if the engine is in recovery following a timeout/abort, recovery CANNOT be authorized
      // based on health checks alone. The operator must verify that the Ollama process was stopped (or restarted)
      // and explicitly specify OLLAMA_STOPPED.
      if (input.recoveryCondition === 'INFERENCE_SETTLED') {
        const err: any = new Error(
          'Cannot authorize reset with INFERENCE_SETTLED: Ollama does not expose per-task execution status, so connectivity cannot prove prior CPU inference has ceased. Operator must terminate/restart Ollama and specify OLLAMA_STOPPED.'
        );
        err.statusCode = 422;
        err.code = 'SETTLED_UNVERIFIABLE_REQUIRES_STOPPED';
        throw err;
      }

      // 6. Stage 1: AI_ENGINE_RESET_ATTEMPTED (sequence: 1)
      if (!hasAttempted) {
        await ActivityService.log({
          action: 'AI_ENGINE_RESET_ATTEMPTED',
          entityType: 'AI_ENGINE',
          entityId: key,
          userId,
          metadata: {
            sequence: 1,
            recoveryCondition: input.recoveryCondition,
            operatorNotes: input.operatorNotes,
            attemptedAt: new Date().toISOString(),
          },
        });
      }

      // 7. Stage 2: AI_ENGINE_RESET_AUTHORIZED (sequence: 2)
      if (!hasAuthorized) {
        await ActivityService.log({
          action: 'AI_ENGINE_RESET_AUTHORIZED',
          entityType: 'AI_ENGINE',
          entityId: key,
          userId,
          metadata: {
            sequence: 2,
            recoveryCondition: input.recoveryCondition,
            operatorNotes: input.operatorNotes,
            authorizedAt: new Date().toISOString(),
          },
        });
      }

      // 8. Marker Cleanup on Filesystem
      try {
        await RecoveryMarkerManager.purgeAllMarkers();
      } catch (fileErr: any) {
        const err: any = new Error(`Failed to remove recovery markers from storage: ${fileErr.message}`);
        err.statusCode = 500;
        err.code = 'MARKER_CLEANUP_FAILED';
        throw err;
      }

      // 9. Stage 3: AI_ENGINE_RESET_COMPLETED (sequence: 3)
      await ActivityService.log({
        action: 'AI_ENGINE_RESET_COMPLETED',
        entityType: 'AI_ENGINE',
        entityId: key,
        userId,
        metadata: {
          sequence: 3,
          completedAt: new Date().toISOString(),
        },
      });

      // 10. Transition Mutex to IDLE
      GenerationMutex.completeReset();

      return {
        success: true,
        message: 'AI engine recovery state successfully cleared. Engine is now IDLE.',
        data: {
          status: 'IDLE',
          idempotencyKey: key,
        },
      };
    } finally {
      ResetMutex.release(key);
    }
  }
}
