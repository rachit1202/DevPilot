import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CANONICAL_STORAGE_DIR, AI_RECOVERY_LOCK_PATH, initializeStorageDir } from './storage.util';

export interface RecoveryMarkerPayload {
  taskId: string;
  model: string;
  state: 'IN_FLIGHT' | 'TIMEOUT' | 'ABORTED';
  createdAt: string;
  pid: number;
}

/**
 * Manages the persistent pre-inference recovery marker.
 * Enforces atomic temporary write + handle.sync() + atomic rename.
 */
export class RecoveryMarkerManager {
  /**
   * Persists the recovery marker atomically BEFORE Ollama inference begins.
   */
  static async persistMarker(taskId: string, model: string): Promise<void> {
    await initializeStorageDir();

    const payload: RecoveryMarkerPayload = {
      taskId,
      model,
      state: 'IN_FLIGHT',
      createdAt: new Date().toISOString(),
      pid: process.pid,
    };

    const tempFilename = `ai-recovery.lock.tmp.${process.pid}.${Date.now()}.${crypto.randomUUID()}`;
    const tempPath = path.join(CANONICAL_STORAGE_DIR, tempFilename);

    let handle: fs.promises.FileHandle | null = null;
    try {
      handle = await fs.promises.open(tempPath, 'w');
      await handle.writeFile(JSON.stringify(payload, null, 2), 'utf8');
      await handle.sync(); // Force write to OS/controller cache
      await handle.close();
      handle = null;

      // Atomic rename with Windows retry backoff for transient locks
      await this.atomicRenameWithRetry(tempPath, AI_RECOVERY_LOCK_PATH);
    } catch (err) {
      if (handle) {
        try {
          await handle.close();
        } catch {}
      }
      // Attempt to clean up temp file on failure
      try {
        await fs.promises.unlink(tempPath);
      } catch {}
      throw err;
    }
  }

  /**
   * Cleans up the recovery marker upon confirmed normal generation completion.
   */
  static async removeMarker(): Promise<void> {
    try {
      await fs.promises.unlink(AI_RECOVERY_LOCK_PATH);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    // Clean up any stray temp files matching the prefix
    await this.cleanupTempMarkers();
  }

  /**
   * Scans storage for any existing primary or temporary markers on startup.
   */
  static async scanForRecoveryMarkers(): Promise<{ hasMarkers: boolean; details: string[] }> {
    await initializeStorageDir();
    const files = await fs.promises.readdir(CANONICAL_STORAGE_DIR);
    const markerFiles = files.filter(
      (f) => f === 'ai-recovery.lock' || f.startsWith('ai-recovery.lock.tmp.')
    );

    return {
      hasMarkers: markerFiles.length > 0,
      details: markerFiles,
    };
  }

  /**
   * Cleans up all recognized recovery markers during an authorized engine reset.
   */
  static async purgeAllMarkers(): Promise<void> {
    await initializeStorageDir();
    const files = await fs.promises.readdir(CANONICAL_STORAGE_DIR);
    const toDelete = files.filter(
      (f) => f === 'ai-recovery.lock' || f.startsWith('ai-recovery.lock.tmp.')
    );

    for (const f of toDelete) {
      const p = path.join(CANONICAL_STORAGE_DIR, f);
      try {
        await fs.promises.unlink(p);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
  }

  private static async cleanupTempMarkers(): Promise<void> {
    try {
      const files = await fs.promises.readdir(CANONICAL_STORAGE_DIR);
      const tempFiles = files.filter((f) => f.startsWith('ai-recovery.lock.tmp.'));
      for (const tf of tempFiles) {
        try {
          await fs.promises.unlink(path.join(CANONICAL_STORAGE_DIR, tf));
        } catch {}
      }
    } catch {}
  }

  private static async atomicRenameWithRetry(src: string, dest: string, attempts = 3): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        await fs.promises.rename(src, dest);
        return;
      } catch (err: any) {
        if ((err.code === 'EPERM' || err.code === 'EBUSY') && i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 25 * Math.pow(2, i)));
          continue;
        }
        throw err;
      }
    }
  }
}
