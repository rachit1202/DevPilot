import path from 'path';
import fs from 'fs';
import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { UserRole } from '@devpilot/shared';
import { AuthUser } from '../../types/fastify';
import {
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  DANGEROUS_EXTENSIONS,
  validateMagicBytes,
  sanitizeFilename,
  generateSecureFileName,
  assertSafeStoragePath,
  ensureUploadDirectory,
} from './media.security';

export interface UploadMediaParams {
  buffer: Buffer;
  originalName: string;
  declaredMimeType: string;
  userId: string;
}

export interface ListMediaQuery {
  page?: number;
  limit?: number;
  mimeType?: string;
}

export class MediaService {
  /**
   * Securely saves an uploaded image file, validating file signatures (magic bytes),
   * enforcing size limits, generating random filenames, and creating a database record.
   */
  static async uploadMedia(params: UploadMediaParams) {
    const { buffer, originalName, declaredMimeType, userId } = params;

    // 1. Strict File Size Validation
    if (!buffer || buffer.length === 0) {
      throw new Error('FILE_EMPTY: Uploaded file is empty.');
    }
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`FILE_TOO_LARGE: File size (${Math.round(buffer.length / 1024 / 1024)}MB) exceeds maximum allowed size of 10MB.`);
    }

    // 2. Extension & Dangerous File Type Validation
    const cleanOriginalName = sanitizeFilename(originalName);
    const originalExt = path.extname(cleanOriginalName).toLowerCase();

    if (DANGEROUS_EXTENSIONS.has(originalExt)) {
      throw new Error(`SECURITY_REJECTED: Upload of executable or script files (${originalExt}) is strictly prohibited.`);
    }

    const normalizedMime = declaredMimeType.toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES[normalizedMime]) {
      throw new Error(`UNSUPPORTED_TYPE: MIME type '${declaredMimeType}' is not supported. Permitted types: JPEG, PNG, WebP, GIF.`);
    }

    // 3. Binary Magic Byte / File Signature Validation (Anti-Spoofing)
    const signatureCheck = validateMagicBytes(buffer, normalizedMime);
    if (!signatureCheck.valid) {
      throw new Error(`FILE_CORRUPT_OR_SPOOFED: ${signatureCheck.error}`);
    }

    const verifiedMime = signatureCheck.detectedMime || normalizedMime;

    // 4. Generate Safe Server-Generated Filename
    const secureFileName = generateSecureFileName(verifiedMime);
    const absoluteTarget = path.join(UPLOAD_DIR, secureFileName);

    // 5. Path Traversal & Collision Protection
    assertSafeStoragePath(absoluteTarget);
    await ensureUploadDirectory();

    if (fs.existsSync(absoluteTarget)) {
      throw new Error('COLLISION_ERROR: Target file already exists. Please retry upload.');
    }

    // 6. Atomic Disk Write
    await fs.promises.writeFile(absoluteTarget, buffer, { mode: 0o640 });

    // 7. Atomic Database Record Creation with Activity Log
    try {
      const asset = await prisma.mediaAsset.create({
        data: {
          fileName: secureFileName,
          originalName: cleanOriginalName,
          mimeType: verifiedMime,
          fileSize: buffer.length,
          filePath: `storage/uploads/${secureFileName}`,
        },
      });

      await ActivityService.log({
        userId,
        action: 'MEDIA_UPLOADED',
        entityType: 'MEDIA_ASSET',
        entityId: asset.id,
        metadata: {
          fileName: secureFileName,
          originalName: cleanOriginalName,
          mimeType: verifiedMime,
          fileSize: buffer.length,
        },
      });

      return asset;
    } catch (err) {
      // Cleanup orphaned file from disk on DB failure
      try {
        if (fs.existsSync(absoluteTarget)) {
          await fs.promises.unlink(absoluteTarget);
        }
      } catch (cleanupErr) {
        console.error('Failed to cleanup orphan file after DB failure:', cleanupErr);
      }
      throw err;
    }
  }

  /**
   * Retrieves paginated list of media assets with linked content count.
   */
  static async listMedia(query: ListMediaQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: { mimeType?: string } = {};
    if (query.mimeType) {
      where.mimeType = query.mimeType;
    }

    const [total, assets] = await Promise.all([
      prisma.mediaAsset.count({ where }),
      prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: {
            select: { contentLinks: true },
          },
        },
      }),
    ]);

    return {
      assets: assets.map((a) => ({
        ...a,
        fileUrl: `/api/v1/media/${a.id}/file`,
        linkedPostsCount: a._count.contentLinks,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves a single media asset with its linked posts.
   */
  static async getMediaById(id: string) {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        contentLinks: {
          include: {
            contentPost: {
              select: {
                id: true,
                title: true,
                status: true,
                contentType: true,
              },
            },
          },
        },
      },
    });

    if (!asset) return null;

    return {
      ...asset,
      fileUrl: `/api/v1/media/${asset.id}/file`,
      linkedPosts: asset.contentLinks.map((cl) => cl.contentPost),
    };
  }

  /**
   * Retrieves file path on disk for authenticated streaming.
   */
  static async getMediaFile(id: string): Promise<{ absolutePath: string; mimeType: string; originalName: string } | null> {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id },
      select: { fileName: true, mimeType: true, originalName: true },
    });

    if (!asset) return null;

    const absolutePath = path.join(UPLOAD_DIR, asset.fileName);
    assertSafeStoragePath(absolutePath);

    if (!fs.existsSync(absolutePath)) {
      return null;
    }

    return {
      absolutePath,
      mimeType: asset.mimeType,
      originalName: asset.originalName,
    };
  }

  /**
   * Deletes a media asset and cleans up its file on disk.
   * - Only OWNER and ADMIN roles are authorized.
   * - If linked to active posts, deletion is blocked (409) unless explicitly forced.
   * - Atomically cleans up ContentMedia relations and logs forced flag with unlinked post details.
   */
  static async deleteMedia(id: string, user: AuthUser, force: boolean = false) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new Error('FORBIDDEN: Only Owners and Admins are authorized to delete media assets.');
    }

    const asset = await prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        contentLinks: {
          include: {
            contentPost: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!asset) {
      throw new Error('NOT_FOUND: Media asset does not exist.');
    }

    if (asset.contentLinks.length > 0 && !force) {
      const titles = asset.contentLinks.map((cl) => `"${cl.contentPost.title}"`).join(', ');
      throw new Error(`LINKED_TO_POSTS: Cannot delete media asset because it is currently linked to ${asset.contentLinks.length} post(s): ${titles}. Unlink it first or confirm force deletion.`);
    }

    const absolutePath = path.join(UPLOAD_DIR, asset.fileName);
    assertSafeStoragePath(absolutePath);

    const unlinkedPostIds = asset.contentLinks.map((cl) => cl.contentPost.id);
    const unlinkedPostTitles = asset.contentLinks.map((cl) => cl.contentPost.title);

    // Atomically delete relations and asset record
    await prisma.$transaction(async (tx) => {
      if (asset.contentLinks.length > 0) {
        await tx.contentMedia.deleteMany({
          where: { mediaAssetId: id },
        });
      }

      await tx.mediaAsset.delete({
        where: { id },
      });

      await ActivityService.log({
        tx,
        userId: user.id,
        action: 'MEDIA_DELETED',
        entityType: 'MEDIA_ASSET',
        entityId: id,
        metadata: {
          assetId: id,
          fileName: asset.fileName,
          originalName: asset.originalName,
          fileSize: asset.fileSize,
          forced: force,
          unlinkedPostIds,
          unlinkedPostTitles,
        },
      });
    });

    // Cleanup physical file on disk (resilient to missing file)
    try {
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch (fsErr) {
      console.warn(`Warning: Could not unlink file ${absolutePath} from disk:`, fsErr);
    }

    return { success: true, message: 'Media asset deleted successfully' };
  }
}
