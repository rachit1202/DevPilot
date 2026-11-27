import path from 'path';
import fs from 'fs';
import { config } from '../../config/env';

// Deterministically anchor to workspace root (3 levels up from modules/ai) and monorepo root (5 levels up)
const API_WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const MONOREPO_ROOT = path.resolve(API_WORKSPACE_ROOT, '../..');

/**
 * Resolves the canonical storage directory.
 * - If config.STORAGE_DIR is absolute, normalize and return directly.
 * - If relative, anchor strictly to the MONOREPO_ROOT.
 */
export function getCanonicalStorageDir(): string {
  if (path.isAbsolute(config.STORAGE_DIR)) {
    return path.normalize(config.STORAGE_DIR);
  }
  return path.normalize(path.resolve(MONOREPO_ROOT, config.STORAGE_DIR));
}

export const CANONICAL_STORAGE_DIR = getCanonicalStorageDir();
export const AI_RECOVERY_LOCK_PATH = path.join(CANONICAL_STORAGE_DIR, 'ai-recovery.lock');
export const AI_PID_LOCK_PATH = path.join(CANONICAL_STORAGE_DIR, 'ai-engine.pid');

/**
 * Initializes and verifies storage directory accessibility on server boot.
 * Throws if creation or directory scanning fails, forcing fail-closed behavior.
 */
export async function initializeStorageDir(): Promise<string> {
  const dir = getCanonicalStorageDir();
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    // Scan directory to verify read/list access
    await fs.promises.readdir(dir);
    return dir;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`STORAGE_INIT_FAILED: Could not initialize or scan canonical storage dir at ${dir}: ${errorMsg}`);
  }
}
