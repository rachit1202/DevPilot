import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

import { getCanonicalUploadsDir } from '../ai/storage.util';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB strict limit for image assets

// Authoritative uploads directory derived deterministically from the canonical storage root
export const UPLOAD_DIR = getCanonicalUploadsDir();

export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};

// Strict list of executable / dangerous extensions that must be rejected unconditionally
export const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.vbs', '.py', '.rb',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
  '.js', '.mjs', '.cjs', '.ts', '.html', '.htm', '.xhtml',
  '.svg', '.xml', // SVGs can contain executable <script> tags leading to XSS
  '.jar', '.war', '.dll', '.so', '.dylib', '.com', '.msi', '.scr',
]);

/**
 * Validates actual binary magic bytes against declared MIME type.
 * Protects against MIME spoofing where an attacker renames an executable or HTML to .png/.jpg.
 */
export function validateMagicBytes(buffer: Buffer, declaredMime: string): { valid: boolean; detectedMime?: string; error?: string } {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'File buffer too small or empty to verify signature' };
  }

  // 1. JPEG signature: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    if (declaredMime !== 'image/jpeg') {
      return { valid: false, error: `MIME spoofing detected: Declared ${declaredMime} but file signature is image/jpeg` };
    }
    return { valid: true, detectedMime: 'image/jpeg' };
  }

  // 2. PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    if (declaredMime !== 'image/png') {
      return { valid: false, error: `MIME spoofing detected: Declared ${declaredMime} but file signature is image/png` };
    }
    return { valid: true, detectedMime: 'image/png' };
  }

  // 3. WebP signature: "RIFF" (bytes 0-3) and "WEBP" (bytes 8-11)
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    if (declaredMime !== 'image/webp') {
      return { valid: false, error: `MIME spoofing detected: Declared ${declaredMime} but file signature is image/webp` };
    }
    return { valid: true, detectedMime: 'image/webp' };
  }

  // 4. GIF signature: "GIF87a" or "GIF89a"
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    if (declaredMime !== 'image/gif') {
      return { valid: false, error: `MIME spoofing detected: Declared ${declaredMime} but file signature is image/gif` };
    }
    return { valid: true, detectedMime: 'image/gif' };
  }

  return {
    valid: false,
    error: `Unsupported file signature or corrupt image. Only verified JPEG, PNG, WebP, and GIF images are permitted.`,
  };
}

/**
 * Strips dangerous path traversal patterns, control characters, and special symbols from original filenames.
 */
export function sanitizeFilename(originalName: string): string {
  if (!originalName) return 'unnamed_asset';

  // Extract base filename without directories
  const baseName = path.basename(originalName);

  // Replace null bytes and path traversal artifacts
  const clean = baseName
    .replace(/\0/g, '')
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 200);

  return clean || 'unnamed_asset';
}

/**
 * Generates an unguessable UUID-based server filename with safe verified extension.
 */
export function generateSecureFileName(mimeType: string): string {
  const allowedExts = ALLOWED_MIME_TYPES[mimeType];
  const ext = (allowedExts && allowedExts[0]) || '.bin';
  const id = crypto.randomUUID();
  return `${id}${ext}`;
}

/**
 * Prevents directory traversal attacks by verifying the resolved target path
 * remains strictly within the storage uploads root directory.
 */
export function assertSafeStoragePath(resolvedPath: string, baseDir: string = UPLOAD_DIR): void {
  const normalizedTarget = path.normalize(path.resolve(resolvedPath));
  const normalizedBase = path.normalize(path.resolve(baseDir));

  const baseWithSep = normalizedBase.endsWith(path.sep) ? normalizedBase : `${normalizedBase}${path.sep}`;

  if (normalizedTarget !== normalizedBase && !normalizedTarget.startsWith(baseWithSep)) {
    throw new Error('SECURITY VIOLATION: Path traversal detected. Access denied.');
  }
}

/**
 * Ensures the target storage upload directory exists before attempting writes.
 */
export async function ensureUploadDirectory(): Promise<void> {
  if (!fs.existsSync(UPLOAD_DIR)) {
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true, mode: 0o750 });
  }
}
