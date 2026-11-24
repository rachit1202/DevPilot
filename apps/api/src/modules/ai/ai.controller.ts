import { FastifyRequest, FastifyReply } from 'fastify';
import { AIService } from './ai.service';
import { ApiResponse, AIStatusResponse } from '@devpilot/shared';

export class AIController {
  /**
   * GET /api/v1/ai/status
   * Discovers whether local Ollama is active, version, and presence of required models.
   */
  static async getStatus(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const status = await AIService.getStatus();
      const response: ApiResponse<AIStatusResponse> = {
        success: true,
        data: status,
      };
      return reply.code(200).send(response);
    } catch {
      // Return safe offline response rather than 500 or unhandled crash
      const fallbackResponse: ApiResponse<AIStatusResponse> = {
        success: true,
        data: {
          available: false,
          ollamaVersion: null,
          primaryModel: '',
          fallbackModel: '',
          primaryModelInstalled: false,
          fallbackModelInstalled: false,
          installedModels: [],
          message: 'Failed to inspect local AI provider.',
        },
      };
      return reply.code(200).send(fallbackResponse);
    }
  }
}
