import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { RecoveryMarkerManager } from './recovery.marker';
import { GenerationMutex } from './generation.mutex';
import { auditAllResetOperations, ActivityLogResetRecord } from './reset.validator';

/**
 * Executes startup reconciliation of reset operations against disk markers.
 * Fails closed if the database or filesystem is ambiguous, corrupted, or unreachable.
 */
export class ResetReconciliationService {
  static async reconcileOnStartup(): Promise<void> {
    try {
      // 1. Query all AI_ENGINE reset records
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
        GenerationMutex.markRecoveryRequired('STARTUP', audit.diagnosticError || 'Audit failed on startup');
        return;
      }

      const markerScan = await RecoveryMarkerManager.scanForRecoveryMarkers();

      // Case A: An incomplete operation exists
      if (audit.pendingOperation) {
        const op = audit.pendingOperation;

        if (op.status === 'PENDING_ATTEMPTED') {
          // ATTEMPTED without AUTHORIZED never auto-completes
          GenerationMutex.markRecoveryRequired('STARTUP', `Incomplete ATTEMPTED reset operation pending for key ${op.key}`);
          return;
        }

        if (op.status === 'PENDING_AUTHORIZED') {
          if (markerScan.hasMarkers) {
            // AUTHORIZED with markers still present: cleanup was interrupted
            GenerationMutex.markRecoveryRequired('STARTUP', `Incomplete AUTHORIZED reset operation pending for key ${op.key} (markers present)`);
            return;
          }

          // AUTHORIZED with markers absent: clean recovery point
          try {
            await ActivityService.log({
              action: 'AI_ENGINE_RESET_COMPLETED',
              entityType: 'AI_ENGINE',
              entityId: op.key,
              metadata: {
                sequence: 3,
                reconciledOnStartup: true,
                authorizedAt: new Date().toISOString(),
              },
            });
            GenerationMutex.completeReset();
            return;
          } catch (logErr: any) {
            GenerationMutex.markRecoveryRequired('STARTUP', `Failed to log completion during startup reconciliation: ${logErr.message}`);
            return;
          }
        }
      }

      // Case B: No pending operation exists
      if (markerScan.hasMarkers) {
        GenerationMutex.markRecoveryRequired('STARTUP', `Recovery markers present on disk without pending reset operation: ${markerScan.details.join(', ')}`);
        return;
      }

      // Safe clean state -> complete reset / ensure IDLE
      GenerationMutex.completeReset();
    } catch (err: any) {
      // Catch DB connection drops or unexpected exceptions -> fail closed
      GenerationMutex.markRecoveryRequired('STARTUP', `Startup reconciliation encountered fatal error: ${err.message}`);
    }
  }
}
