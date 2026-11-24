import { FastifyReply, FastifyRequest } from 'fastify';
import { ContentService } from './content.service';
import { createContentSchema, updateContentSchema, contentQuerySchema, submitApprovalSchema } from '@devpilot/validation';
import { AuthUser } from '../../types/fastify';

export class ContentController {
  static async create(request: FastifyRequest, reply: FastifyReply) {
    const input = createContentSchema.parse(request.body);
    const user = request.user as AuthUser;

    try {
      const post = await ContentService.createContent(input, user);

      return reply.status(201).send({
        success: true,
        message: 'Content post created successfully',
        data: { post },
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
      if (error.message.startsWith('MEDIA_NOT_FOUND')) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = contentQuerySchema.parse(request.query);
    const result = await ContentService.listContent(query);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  }

  static async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const post = await ContentService.getContentById(id);

    if (!post) {
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message: 'Content post not found',
      });
    }

    return reply.status(200).send({
      success: true,
      data: { post },
    });
  }

  static async update(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const { id } = request.params as { id: string };
    const input = updateContentSchema.parse(request.body);
    const user = request.user as AuthUser;

    try {
      const post = await ContentService.updateContent(id, input, user);

      return reply.status(200).send({
        success: true,
        message: 'Content post updated successfully',
        data: { post },
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
      if (error.message.startsWith('INVALID_STATUS_TRANSITION') || error.message.startsWith('MEDIA_NOT_FOUND')) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async approve(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = (request.body as { comment?: string }) || {};
    const input = submitApprovalSchema.parse(body);
    const user = request.user as AuthUser;

    try {
      const post = await ContentService.approveContent(id, user, input.comment);

      return reply.status(200).send({
        success: true,
        message: 'Content post approved successfully',
        data: { post },
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
      if (error.message.startsWith('INVALID_POST_STATE')) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async reject(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = (request.body as { comment?: string }) || {};
    const input = submitApprovalSchema.parse(body);
    const user = request.user as AuthUser;

    try {
      const post = await ContentService.rejectContent(id, user, input.comment);

      return reply.status(200).send({
        success: true,
        message: 'Content post rejected successfully',
        data: { post },
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
      if (error.message.startsWith('INVALID_POST_STATE')) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async submitReview(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const user = request.user as AuthUser;

    try {
      const post = await ContentService.submitForReview(id, user);

      return reply.status(200).send({
        success: true,
        message: 'Content post submitted for review successfully',
        data: { post },
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
      if (error.message.startsWith('INVALID_POST_STATE')) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const user = request.user as AuthUser;

    try {
      await ContentService.deleteContent(id, user);

      return reply.status(200).send({
        success: true,
        message: 'Content post deleted successfully',
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
      throw err;
    }
  }
}
