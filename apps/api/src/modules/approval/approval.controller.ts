import { FastifyReply, FastifyRequest } from 'fastify';
import { ApprovalService } from './approval.service';
import { ContentService } from '../content/content.service';
import { approvalQuerySchema, submitApprovalSchema } from '@devpilot/validation';
import { AuthUser } from '../../types/fastify';

export class ApprovalController {
  /**
   * General list endpoint. Based on query.tab ('pending' or 'history'), returns relevant dataset.
   */
  static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = approvalQuerySchema.parse(request.query);
    const user = request.user as AuthUser;

    if (query.tab === 'history') {
      const result = await ApprovalService.getApprovalHistory(query, user);
      return reply.status(200).send({
        success: true,
        data: result,
      });
    }

    const result = await ApprovalService.getPendingApprovals(query, user);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  }

  /**
   * Retrieves pending approvals.
   */
  static async pending(request: FastifyRequest, reply: FastifyReply) {
    const query = approvalQuerySchema.parse(request.query);
    const user = request.user as AuthUser;
    const result = await ApprovalService.getPendingApprovals(query, user);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  }

  /**
   * Retrieves approval history.
   */
  static async history(request: FastifyRequest, reply: FastifyReply) {
    const query = approvalQuerySchema.parse(request.query);
    const user = request.user as AuthUser;
    const result = await ApprovalService.getApprovalHistory(query, user);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  }

  /**
   * Retrieves approval statistics.
   */
  static async stats(_request: FastifyRequest, reply: FastifyReply) {
    const stats = await ApprovalService.getStats();

    return reply.status(200).send({
      success: true,
      data: { stats },
    });
  }

  /**
   * Approves a content post (reuses ContentService.approveContent).
   */
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

  /**
   * Rejects a content post (reuses ContentService.rejectContent).
   */
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
}
