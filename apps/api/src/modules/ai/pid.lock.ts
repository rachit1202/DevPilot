import net from 'net';
import crypto from 'crypto';
import { config } from '../../config/env';

export interface PidLockPayload {
  pid: number;
  ownerToken: string;
  startedAt: string;
  port: number;
}

/**
 * Kernel-Backed AI Process Ownership Manager.
 *
 * Guarantees exclusive process ownership across DevPilot API processes using an
 * operating-system-held loopback TCP socket (127.0.0.1:AI_LOCK_PORT).
 *
 * Key guarantees:
 * 1. Hardware/OS mutual exclusion: The OS kernel enforces single-listener semantics
 *    on bind(). If another process holds the port, bind immediately fails with EADDRINUSE.
 * 2. Instant kernel crash teardown: When a process exits or is killed abruptly
 *    (SIGKILL, taskkill, TerminateProcess), the OS kernel automatically closes the
 *    socket handle and frees the port. No stale lock files can ever persist.
 * 3. Zero filesystem TOCTOU races: Ownership is strictly mediated by the kernel network stack.
 */
export class PidLockManager {
  private static server: net.Server | null = null;
  private static ownerToken: string | null = null;
  private static isOwner = false;
  private static bindingPromise: Promise<{ acquired: boolean; reason?: string; existingOwner?: PidLockPayload }> | null = null;

  /**
   * Attempts to claim exclusive ownership of the AI engine via loopback socket bind.
   * Returns true if successfully bound, false if another process holds the port or on bind failure.
   */
  static async acquireOwnership(customPort?: number): Promise<{ acquired: boolean; reason?: string; existingOwner?: PidLockPayload }> {
    // If this process already owns the socket, return true idempotently
    if (this.isOwner && this.server) {
      return { acquired: true };
    }

    // Serialize concurrent acquire calls within the same process
    if (this.bindingPromise) {
      return this.bindingPromise;
    }

    this.bindingPromise = this.bindSocket(customPort || config.AI_LOCK_PORT);
    try {
      return await this.bindingPromise;
    } finally {
      this.bindingPromise = null;
    }
  }

  private static bindSocket(port: number): Promise<{ acquired: boolean; reason?: string; existingOwner?: PidLockPayload }> {
    return new Promise((resolve) => {
      const token = crypto.randomUUID();
      const server = net.createServer();

      // Ensure errors on active server after bind are safely handled
      server.on('error', (err: any) => {
        if (!this.isOwner) {
          // Error occurred before listening callback
          if (err.code === 'EADDRINUSE') {
            resolve({
              acquired: false,
              reason: 'AI_ENGINE_OWNED_BY_ANOTHER_PROCESS',
            });
          } else {
            resolve({
              acquired: false,
              reason: `SOCKET_BIND_FAILED: ${err.code || err.message}`,
            });
          }
        }
      });

      // Bind exclusively to IPv4 loopback 127.0.0.1
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        this.ownerToken = token;
        this.isOwner = true;

        resolve({ acquired: true });
      });
    });
  }

  /**
   * Checks whether this process currently holds exclusive kernel socket ownership.
   */
  static isEngineOwner(): boolean {
    return this.isOwner;
  }

  /**
   * Returns the current in-process owner token, if owned.
   */
  static getOwnerToken(): string | null {
    return this.ownerToken;
  }

  /**
   * Releases exclusive ownership by closing the loopback server.
   * Waits for the server close callback before completing.
   */
  static async releaseOwnership(): Promise<void> {
    if (!this.server) {
      this.isOwner = false;
      this.ownerToken = null;
      return;
    }

    const s = this.server;
    this.server = null;
    this.isOwner = false;
    this.ownerToken = null;

    await new Promise<void>((resolve) => {
      s.close(() => {
        resolve();
      });
    });
  }
}
