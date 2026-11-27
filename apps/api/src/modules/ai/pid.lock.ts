import fs from 'fs';
import crypto from 'crypto';
import { AI_PID_LOCK_PATH, initializeStorageDir } from './storage.util';

export interface PidLockPayload {
  pid: number;
  ownerToken: string;
  startedAt: string;
}

/**
 * Cooperative PID Lock for Single-Process AI Engine Ownership.
 * Uses atomic exclusive file creation ('wx').
 *
 * NOTE: On Windows (NTFS), an open file handle from open('wx') does not enforce an
 * OS-level mandatory delete-lock. It is strictly an atomic cooperative lock among
 * DevPilot processes. Manual external deletion while the owner runs will break
 * cooperative guarantees.
 */
export class PidLockManager {
  private static lockHandle: fs.promises.FileHandle | null = null;
  private static ownerToken: string | null = null;
  private static isOwner = false;

  /**
   * Attempts to claim exclusive cooperative ownership of the AI engine.
   * Returns true if claimed, false if another process or stale lock exists.
   */
  static async acquireOwnership(): Promise<{ acquired: boolean; reason?: string; existingOwner?: PidLockPayload }> {
    await initializeStorageDir();

    const token = crypto.randomUUID();
    const payload: PidLockPayload = {
      pid: process.pid,
      ownerToken: token,
      startedAt: new Date().toISOString(),
    };

    try {
      // Atomic exclusive creation flag 'wx'
      const handle = await fs.promises.open(AI_PID_LOCK_PATH, 'wx');
      await handle.writeFile(JSON.stringify(payload, null, 2), 'utf8');
      await handle.sync();

      this.lockHandle = handle;
      this.ownerToken = token;
      this.isOwner = true;

      return { acquired: true };
    } catch (err: any) {
      if (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'EBUSY') {
        // Stale or active lock exists. Read diagnostic info if available.
        let existing: PidLockPayload | undefined;
        try {
          const raw = await fs.promises.readFile(AI_PID_LOCK_PATH, 'utf8');
          existing = JSON.parse(raw);
        } catch {
          // Unreadable or corrupted existing lock
        }
        return {
          acquired: false,
          reason: 'AI_ENGINE_OWNED_BY_ANOTHER_PROCESS',
          existingOwner: existing,
        };
      }
      throw err;
    }
  }

  /**
   * Checks whether this process currently owns the cooperative PID lock.
   */
  static isEngineOwner(): boolean {
    return this.isOwner;
  }

  /**
   * Releases the cooperative lock during graceful shutdown.
   * Verifies ownerToken before unlinking to prevent removing another process's lock.
   */
  static async releaseOwnership(): Promise<void> {
    if (!this.isOwner || !this.ownerToken) {
      return;
    }

    try {
      // Verify token in file before unlinking
      let canUnlink = false;
      try {
        const raw = await fs.promises.readFile(AI_PID_LOCK_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.ownerToken === this.ownerToken) {
          canUnlink = true;
        }
      } catch {
        // File may have been unlinked or corrupted externally
      }

      if (this.lockHandle) {
        try {
          await this.lockHandle.close();
        } catch {}
        this.lockHandle = null;
      }

      if (canUnlink) {
        await fs.promises.unlink(AI_PID_LOCK_PATH);
      }
    } catch (err) {
      console.error('Error during PID lock release:', err);
    } finally {
      this.isOwner = false;
      this.ownerToken = null;
    }
  }
}
