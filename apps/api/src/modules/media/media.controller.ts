import { FastifyReply, FastifyRequest } from 'fastify';
import fs from 'fs';
import { MediaService } from './media.service';
import { mediaQuerySchema } from '@devpilot/validation';
import { AuthUser } from '../../types/fastify';

export class MediaController {
  static async upload(request: FastifyRequest, reply: FastifyReply) {
    if (!request.isMultipart()) {
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: 'Request must be multipart/form-data with a file payload.',
      });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: 'No file was provided in the upload request.',
      });
    }

    try {
      const buffer = await data.toBuffer();
      const user = request.user as AuthUser;

      const asset = await MediaService.uploadMedia({
        buffer,
        originalName: data.filename,
        declaredMimeType: data.mimetype,
        userId: user.id,
      });

      return reply.status(201).send({
        success: true,
        message: 'Media asset uploaded successfully',
        data: { asset },
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (
        error.message.startsWith('FILE_EMPTY') ||
        error.message.startsWith('FILE_TOO_LARGE') ||
        error.message.startsWith('UNSUPPORTED_TYPE') ||
        error.message.startsWith('FILE_CORRUPT_OR_SPOOFED')
      ) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }

      if (error.message.startsWith('SECURITY_REJECTED') || error.message.includes('Path traversal')) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }

      throw err;
    }
  }

  static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = mediaQuerySchema.parse(request.query);
    const result = await MediaService.listMedia(query);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  }

  static async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const asset = await MediaService.getMediaById(id);

    if (!asset) {
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message: 'Media asset not found',
      });
    }

    return reply.status(200).send({
      success: true,
      data: { asset },
    });
  }

  static async getFile(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const fileInfo = await MediaService.getMediaFile(id);

    if (!fileInfo) {
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message: 'Media file not found on disk',
      });
    }

    // Security headers for serving user-uploaded files
    reply.header('Content-Type', fileInfo.mimeType);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(fileInfo.originalName)}"`);
    reply.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    const stream = fs.createReadStream(fileInfo.absolutePath);
    return reply.send(stream);
  }

  static async delete(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const { id } = request.params as { id: string };
    const query = (request.query as { force?: string }) || {};
    const force = query.force === 'true';
    const user = request.user as AuthUser;

    try {
      await MediaService.deleteMedia(id, user, force);

      return reply.status(200).send({
        success: true,
        message: 'Media asset deleted successfully',
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith('FORBIDDEN')) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }

      if (error.message.startsWith('NOT_FOUND')) {
        return reply.status(404).send({
          success: false,
          error: 'Not Found',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }

      if (error.message.startsWith('LINKED_TO_POSTS')) {
        return reply.status(409).send({
          success: false,
          error: 'Conflict',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }

      throw err;
    }
  }
}
