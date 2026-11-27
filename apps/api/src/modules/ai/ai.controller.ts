import { FastifyRequest, FastifyReply } from 'fastify';
import {
  generateIdeasInputSchema,
  generateCaptionInputSchema,
  generateHooksInputSchema,
  generateHashtagsInputSchema,
  generateCtaInputSchema,
  generateRewriteInputSchema,
  generateCarouselInputSchema,
  aiEngineResetInputSchema,
  aiHistoryQuerySchema,
  aiHistoryParamsSchema,
  saveToDraftSchema,
} from '@devpilot/validation';
import { AIService } from './ai.service';
import { AIEngineResetService } from './reset.service';
import { HistoryService } from './history.service';
import { GenerationMutex } from './generation.mutex';
import { PidLockManager } from './pid.lock';
import { AuthUser } from '../../types/fastify';

export class AIController {
  static async getStatus(_request: FastifyRequest, reply: FastifyReply) {
    const client = AIService.getClient();
    const health = await client.checkHealth();
    const engineStatus = GenerationMutex.getStatus();
    const lockReason = GenerationMutex.getLockReason();
    const isOwner = PidLockManager.isEngineOwner();

    return reply.status(200).send({
      success: true,
      data: {
        provider: 'ollama',
        model: client.getModel(),
        online: health.online,
        version: health.version || null,
        engineStatus,
        isEngineOwner: isOwner,
        lockReason,
      },
    });
  }

  static async generateIdeas(request: FastifyRequest, reply: FastifyReply) {
    const input = generateIdeasInputSchema.parse(request.body);
    const user = (request as any).user as AuthUser;
    const result = await AIService.generateIdeas(input, user.id);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: {
        historyId: result.historyId,
        model: result.model,
        durationMs: result.durationMs,
      },
    });
  }

  static async generateCaption(request: FastifyRequest, reply: FastifyReply) {
    const input = generateCaptionInputSchema.parse(request.body);
    const user = (request as any).user as AuthUser;
    const result = await AIService.generateCaption(input, user.id);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: {
        historyId: result.historyId,
        model: result.model,
        durationMs: result.durationMs,
      },
    });
  }

  static async generateHooks(request: FastifyRequest, reply: FastifyReply) {
    const input = generateHooksInputSchema.parse(request.body);
    const user = (request as any).user as AuthUser;
    const result = await AIService.generateHooks(input, user.id);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: {
        historyId: result.historyId,
        model: result.model,
        durationMs: result.durationMs,
      },
    });
  }

  static async generateHashtags(request: FastifyRequest, reply: FastifyReply) {
    const input = generateHashtagsInputSchema.parse(request.body);
    const user = (request as any).user as AuthUser;
    const result = await AIService.generateHashtags(input, user.id);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: {
        historyId: result.historyId,
        model: result.model,
        durationMs: result.durationMs,
      },
    });
  }

  static async generateCta(request: FastifyRequest, reply: FastifyReply) {
    const input = generateCtaInputSchema.parse(request.body);
    const user = (request as any).user as AuthUser;
    const result = await AIService.generateCta(input, user.id);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: {
        historyId: result.historyId,
        model: result.model,
        durationMs: result.durationMs,
      },
    });
  }

  static async generateRewrite(request: FastifyRequest, reply: FastifyReply) {
    const input = generateRewriteInputSchema.parse(request.body);
    const user = (request as any).user as AuthUser;
    const result = await AIService.generateRewrite(input, user.id);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: {
        historyId: result.historyId,
        model: result.model,
        durationMs: result.durationMs,
      },
    });
  }

  static async generateCarousel(request: FastifyRequest, reply: FastifyReply) {
    const input = generateCarouselInputSchema.parse(request.body);
    const user = (request as any).user as AuthUser;
    const result = await AIService.generateCarousel(input, user.id);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: {
        historyId: result.historyId,
        model: result.model,
        durationMs: result.durationMs,
      },
    });
  }

  static async resetEngine(request: FastifyRequest, reply: FastifyReply) {
    const input = aiEngineResetInputSchema.parse(request.body);
    const user = (request as any).user as AuthUser;
    const result = await AIEngineResetService.executeReset(input, user?.id || 'SYSTEM_OPERATOR');
    return reply.status(200).send(result);
  }

  // ==========================================
  // GENERATION HISTORY HANDLERS (M2.2.2.2)
  // ==========================================

  static async listHistory(request: FastifyRequest, reply: FastifyReply) {
    const query = aiHistoryQuerySchema.parse(request.query);
    const user = (request as any).user as AuthUser;
    const result = await HistoryService.listHistory(query, user);
    return reply.status(200).send(result);
  }

  static async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const params = aiHistoryParamsSchema.parse(request.params);
    const user = (request as any).user as AuthUser;
    const result = await HistoryService.getHistory(params.id, user);
    return reply.status(200).send(result);
  }

  static async deleteHistory(request: FastifyRequest, reply: FastifyReply) {
    const params = aiHistoryParamsSchema.parse(request.params);
    const user = (request as any).user as AuthUser;
    const result = await HistoryService.deleteHistory(params.id, user);
    return reply.status(200).send(result);
  }

  // ==========================================
  // SAVE-TO-DRAFT HANDLER (M2.2.2.3)
  // ==========================================

  static async saveToDraft(request: FastifyRequest, reply: FastifyReply) {
    const params = aiHistoryParamsSchema.parse(request.params);
    const body = saveToDraftSchema.parse(request.body || {});
    const user = (request as any).user as AuthUser;
    const result = await HistoryService.saveToDraft(params.id, body, user);
    return reply.status(201).send({
      success: true,
      data: result,
    });
  }
}
