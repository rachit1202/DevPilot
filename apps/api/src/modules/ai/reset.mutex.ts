/**
 * Dedicated synchronous mutex for serializing AI Engine Reset operations.
 * Ensures that concurrent reset requests (same key or different keys) are handled deterministically.
 */
export class ResetMutex {
  private static isResetActive = false;
  private static activeKey: string | null = null;

  static claim(idempotencyKey: string): { acquired: boolean; reason?: string } {
    if (this.isResetActive) {
      if (this.activeKey === idempotencyKey) {
        return { acquired: false, reason: 'CONCURRENT_SAME_KEY_IN_PROGRESS' };
      }
      return { acquired: false, reason: 'CONCURRENT_RESET_IN_PROGRESS' };
    }
    this.isResetActive = true;
    this.activeKey = idempotencyKey;
    return { acquired: true };
  }

  static release(idempotencyKey: string): void {
    if (this.activeKey === idempotencyKey) {
      this.isResetActive = false;
      this.activeKey = null;
    }
  }

  static getActiveKey(): string | null {
    return this.activeKey;
  }
}
