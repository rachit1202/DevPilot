import crypto from 'crypto';
import { RecoveryMarkerManager } from './recovery.marker';
import { PidLockManager } from './pid.lock';

export type EngineStatus = 'IDLE' | 'GENERATING' | 'RECOVERY_REQUIRED';

/**
 * Concurrency Mutex and Engine Lifecycle Controller for local AI generation.
 *
 * Guarantees:
 * 1. Synchronous atomic claim in the single Node.js process event-loop.
 * 2. Pre-inference atomic recovery marker persistence before contacting Ollama.
 * 3. Exact 3 engine states: IDLE, GENERATING, RECOVERY_REQUIRED.
 * 4. Cooperative PID ownership guard.
 */
export class GenerationMutex {
  private static status: EngineStatus = 'IDLE';
  private static currentTaskId: string | null = null;
  private static lockReason: string | null = null;

  /**
   * Initializes the engine state on server boot by scanning for persistent markers.
   */
  static async initialize(): Promise<void> {
    // 1. Cooperative PID lock check
    const ownership = await PidLockManager.acquireOwnership();
    if (!ownership.acquired) {
      this.status = 'RECOVERY_REQUIRED';
      this.lockReason = 'AI_ENGINE_OWNED_BY_ANOTHER_PROCESS';
      return;
    }

    // 2. Scan for recovery markers
    try {
      const scan = await RecoveryMarkerManager.scanForRecoveryMarkers();
      if (scan.hasMarkers) {
        this.status = 'RECOVERY_REQUIRED';
        this.lockReason = `Existing recovery markers detected: ${scan.details.join(', ')}`;
      } else {
        this.status = 'IDLE';
        this.lockReason = null;
      }
    } catch (err: any) {
      // Fail closed if storage scan fails
      this.status = 'RECOVERY_REQUIRED';
      this.lockReason = `Storage scan failed on startup: ${err.message}`;
    }
  }

  static getStatus(): EngineStatus {
    return this.status;
  }

  static getLockReason(): string | null {
    return this.lockReason;
  }

  /**
   * Synchronously claims the generation lock.
   * Rejects concurrent generations synchronously within the active event-loop tick.
   */
  static claim(): { acquired: boolean; taskId?: string; reason?: string; retryAfter?: number } {
    if (!PidLockManager.isEngineOwner()) {
      return { acquired: false, reason: 'AI_ENGINE_OWNED_BY_ANOTHER_PROCESS' };
    }

    if (this.status === 'RECOVERY_REQUIRED') {
      return { acquired: false, reason: 'AI_RECOVERY_REQUIRED' };
    }

    if (this.status === 'GENERATING') {
      return { acquired: false, reason: 'AI_BUSY', retryAfter: 30 };
    }

    // Synchronous claim inside this event loop tick
    this.status = 'GENERATING';
    this.currentTaskId = crypto.randomUUID();
    return { acquired: true, taskId: this.currentTaskId };
  }

  /**
   * Called immediately after claiming to persist the recovery marker on disk BEFORE contacting Ollama.
   * If persistence fails, safely reverts the claim or enters RECOVERY_REQUIRED.
   */
  static async persistPreInferenceMarker(taskId: string, model: string): Promise<void> {
    if (this.currentTaskId !== taskId) {
      throw new Error('TASK_MISMATCH: Cannot persist marker for an unowned task claim.');
    }

    try {
      await RecoveryMarkerManager.persistMarker(taskId, model);
    } catch (err) {
      // Persistence failed; evaluate disk safety
      const scan = await RecoveryMarkerManager.scanForRecoveryMarkers().catch(() => ({ hasMarkers: true }));
      if (scan.hasMarkers) {
        this.status = 'RECOVERY_REQUIRED';
        this.lockReason = 'Pre-inference marker persistence failed with disk ambiguity.';
      } else {
        // Safe revert
        this.status = 'IDLE';
        this.currentTaskId = null;
      }
      throw err;
    }
  }

  /**
   * Releases the mutex on confirmed normal completion.
   * Verifies taskId ownership before releasing.
   */
  static async release(taskId: string): Promise<void> {
    if (this.currentTaskId !== taskId) {
      // Stale task or mismatch: ignore release
      return;
    }

    try {
      await RecoveryMarkerManager.removeMarker();
      this.status = 'IDLE';
      this.currentTaskId = null;
      this.lockReason = null;
    } catch (err: any) {
      // Marker deletion failed: fail closed
      this.status = 'RECOVERY_REQUIRED';
      this.lockReason = `Marker deletion failed on completion: ${err.message}`;
      this.currentTaskId = null;
    }
  }

  /**
   * Transitions engine into RECOVERY_REQUIRED on timeout, abort, or unrecoverable error.
   */
  static markRecoveryRequired(taskId: string, reason: string): void {
    if (this.currentTaskId !== taskId) {
      return;
    }
    this.status = 'RECOVERY_REQUIRED';
    this.lockReason = reason;
    this.currentTaskId = null;
  }

  /**
   * Forcefully transitions the engine to IDLE following an authorized reset completion.
   */
  static completeReset(): void {
    this.status = 'IDLE';
    this.currentTaskId = null;
    this.lockReason = null;
  }
}
