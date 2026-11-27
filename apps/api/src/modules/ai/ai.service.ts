import { z } from 'zod';
import { AIGenerationType } from '@prisma/client';
import { GenerationPersistenceService } from './persistence.service';
import {
  GenerateIdeasInput,
  GenerateCaptionInput,
  GenerateHooksInput,
  GenerateHashtagsInput,
  GenerateCtaInput,
  GenerateRewriteInput,
  GenerateCarouselInput,
  GenerateReelScriptInput,
  ideasOutputSchema,
  captionOutputSchema,
  hooksOutputSchema,
  hashtagsOutputSchema,
  ctaOutputSchema,
  rewriteOutputSchema,
  createCarouselOutputSchema,
  createReelScriptOutputSchema,
  IdeasOutput,
  CaptionOutput,
  HooksOutput,
  HashtagsOutput,
  CtaOutput,
  RewriteOutput,
  CarouselOutput,
  ReelScriptOutput,
} from '@devpilot/validation';
import { OllamaClient } from './providers/ollama.client';
import { GenerationMutex } from './generation.mutex';
import {
  CODECULTURE_BRAND_CONTEXT,
  ANTI_FABRICATION_SYSTEM_DIRECTIVES,
  detectSuspiciousFabricatedMetrics,
  buildCarouselPrompt,
  buildReelScriptPrompt,
} from './ai.prompts';

export class AIService {
  private static ollamaClient = new OllamaClient();

  static setClient(client: OllamaClient) {
    this.ollamaClient = client;
  }

  static getClient(): OllamaClient {
    return this.ollamaClient;
  }

  /**
   * Internal generation wrapper enforcing:
   * 1. Synchronous mutex claim
   * 2. Pre-inference persistent recovery marker
   * 3. Task execution with bounded 1-shot repair
   * 4. Safe lock release on success or RECOVERY_REQUIRED transition on failure
   */
  private static async executeGeneration<T>(
    _taskName: string,
    prompt: string,
    temperature: number,
    numPredict: number,
    schema: z.ZodSchema<T>,
    rawInputForFabricationCheck: string
  ): Promise<{ data: T; durationMs: number; model: string }> {
    const claim = GenerationMutex.claim();
    if (!claim.acquired) {
      if (claim.reason === 'AI_RECOVERY_REQUIRED') {
        const error: any = new Error('AI engine is in RECOVERY_REQUIRED state. Operator reset required.');
        error.code = 'AI_RECOVERY_REQUIRED';
        error.statusCode = 503;
        throw error;
      }
      if (claim.reason === 'AI_ENGINE_OWNED_BY_ANOTHER_PROCESS') {
        const error: any = new Error('AI engine is owned by another API process or locked.');
        error.code = 'AI_ENGINE_OWNED_BY_ANOTHER_PROCESS';
        error.statusCode = 503;
        throw error;
      }
      const error: any = new Error('AI engine is currently busy processing another request.');
      error.code = 'AI_BUSY';
      error.statusCode = 429;
      error.retryAfter = claim.retryAfter || 30;
      throw error;
    }

    const taskId = claim.taskId!;
    const model = this.ollamaClient.getModel();

    // 2. Pre-inference persistent marker
    try {
      await GenerationMutex.persistPreInferenceMarker(taskId, model);
    } catch (markerErr: any) {
      const error: any = new Error(`Failed to persist pre-inference recovery marker: ${markerErr.message}`);
      error.code = 'MARKER_PERSISTENCE_FAILED';
      error.statusCode = 500;
      throw error;
    }

    const systemPrompt = `You are DevPilot's AI Content Intelligence Engine.\n${CODECULTURE_BRAND_CONTEXT}\n${ANTI_FABRICATION_SYSTEM_DIRECTIVES}`;

    try {
      // 3. Inference call
      const res = await this.ollamaClient.generateCompletion({
        prompt,
        system: systemPrompt,
        temperature,
        numPredict,
      });

      // Parse and validate with 1-shot repair if malformed
      const parsedData = await this.parseAndValidateWithRepair(
        res.response,
        schema,
        prompt,
        systemPrompt,
        rawInputForFabricationCheck,
        numPredict
      );

      // 4. Confirmed normal completion -> remove marker & release mutex
      await GenerationMutex.release(taskId);

      return {
        data: parsedData,
        durationMs: res.totalDurationMs || 0,
        model,
      };
    } catch (err: any) {
      // Abnormal completion: timeout, abort, malformed output -> enter RECOVERY_REQUIRED
      if (err.message?.includes('OLLAMA_TIMEOUT')) {
        GenerationMutex.markRecoveryRequired(taskId, 'Generation timed out on CPU');
        const timeoutError: any = new Error('AI generation timed out after configured limit on local CPU.');
        timeoutError.code = 'AI_TIMEOUT';
        timeoutError.statusCode = 504;
        throw timeoutError;
      }

      // If output was malformed or model failed
      GenerationMutex.markRecoveryRequired(taskId, `Inference error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Parses JSON output, validates with Zod, checks anti-fabrication heuristic,
   * and performs at most 1 bounded repair attempt.
   */
  private static async parseAndValidateWithRepair<T>(
    initialResponse: string,
    schema: z.ZodSchema<T>,
    originalPrompt: string,
    systemPrompt: string,
    rawInputText: string,
    repairNumPredict = 512
  ): Promise<T> {
    let parsed: any;
    let isValid = false;
    let validationError = '';

    try {
      parsed = JSON.parse(initialResponse);
      const valResult = schema.safeParse(parsed);
      if (valResult.success) {
        parsed = valResult.data;
        isValid = true;
      } else {
        validationError = valResult.error.message;
      }
    } catch (e: any) {
      validationError = `JSON parse failed: ${e.message}`;
    }

    // Check anti-fabrication heuristic
    if (isValid && detectSuspiciousFabricatedMetrics(rawInputText, JSON.stringify(parsed))) {
      isValid = false;
      validationError = 'Suspicious unsourced percentage or quantitative metrics detected in response.';
    }

    if (isValid) {
      return parsed as T;
    }

    // Exactly 1 bounded repair attempt
    const repairPrompt = `${originalPrompt}\n\nIMPORTANT REPAIR REQUEST:\nYour previous response was rejected due to: ${validationError}.\nRe-generate the response strictly following the JSON schema. NEVER invent percentages or numbers not provided. Respond ONLY with valid JSON.`;

    const repairRes = await this.ollamaClient.generateCompletion({
      prompt: repairPrompt,
      system: systemPrompt,
      temperature: 0.2, // Lower temperature for strict JSON repair
      numPredict: Math.max(repairNumPredict, 512),
    });

    try {
      const repairedJson = JSON.parse(repairRes.response);
      const finalVal = schema.safeParse(repairedJson);
      if (!finalVal.success) {
        const error: any = new Error(`AI generated malformed output: ${finalVal.error.message}`);
        error.code = 'AI_MALFORMED_OUTPUT';
        error.statusCode = 502;
        throw error;
      }

      if (detectSuspiciousFabricatedMetrics(rawInputText, JSON.stringify(finalVal.data))) {
        const error: any = new Error('AI generated fabricated metrics even after repair.');
        error.code = 'AI_FABRICATION_DETECTED';
        error.statusCode = 502;
        throw error;
      }

      return finalVal.data;
    } catch (parseErr: any) {
      const error: any = new Error(`AI generated invalid JSON output after repair: ${parseErr.message}`);
      error.code = 'AI_MALFORMED_OUTPUT';
      error.statusCode = 502;
      throw error;
    }
  }

  // ==========================================
  // 6 GENERATION CAPABILITIES
  // ==========================================

  static async generateIdeas(
    input: GenerateIdeasInput,
    userId: string
  ): Promise<{ data: IdeasOutput; durationMs: number; model: string; historyId: string }> {
    const prompt = `Task: Generate exactly 3 social media content concepts for developers.\n<user_input>\nTopic: ${input.topic}\nAudience: ${input.targetAudience || 'Developers'}\nFormat: ${input.contentType || 'Any'}\n</user_input>\nJSON Schema: { "ideas": [ { "title": "string", "concept": "string", "suggestedFormat": "string", "angle": "string" } ] }`;
    const gen = await this.executeGeneration('ideas', prompt, 0.7, 768, ideasOutputSchema, input.topic);

    const historyId = await GenerationPersistenceService.persistHistory({
      generationType: AIGenerationType.IDEAS,
      inputPayload: input as unknown as Record<string, unknown>,
      outputPayload: gen.data as unknown as Record<string, unknown>,
      model: gen.model,
      durationMs: gen.durationMs,
      userId,
    });

    return {
      data: gen.data,
      durationMs: gen.durationMs,
      model: gen.model,
      historyId,
    };
  }

  static async generateCaption(
    input: GenerateCaptionInput,
    userId: string
  ): Promise<{ data: CaptionOutput; durationMs: number; model: string; historyId: string }> {
    const prompt = `Task: Generate exactly 1 structured social caption with hook, body, CTA and hashtags.\n<user_input>\nTopic: ${input.topic}\nTone: ${input.tone || 'developer-friendly'}\n</user_input>\nJSON Schema: { "title": "string", "hook": "string", "caption": "string", "cta": "string", "hashtags": ["#tag1", "#tag2"] }`;
    const gen = await this.executeGeneration('caption', prompt, 0.7, 512, captionOutputSchema, input.topic);

    const historyId = await GenerationPersistenceService.persistHistory({
      generationType: AIGenerationType.CAPTION,
      inputPayload: input as unknown as Record<string, unknown>,
      outputPayload: gen.data as unknown as Record<string, unknown>,
      model: gen.model,
      durationMs: gen.durationMs,
      userId,
    });

    return {
      data: gen.data,
      durationMs: gen.durationMs,
      model: gen.model,
      historyId,
    };
  }

  static async generateHooks(
    input: GenerateHooksInput,
    userId: string
  ): Promise<{ data: HooksOutput; durationMs: number; model: string; historyId: string }> {
    const prompt = `Task: Generate exactly 5 attention-grabbing hooks for developers.\n<user_input>\nTopic: ${input.topic}\nStyle: ${input.style || 'curiosity/problem-solving'}\n</user_input>\nJSON Schema: { "hooks": ["string1", "string2", "string3", "string4", "string5"] }`;
    const gen = await this.executeGeneration('hooks', prompt, 0.8, 256, hooksOutputSchema, input.topic);

    const historyId = await GenerationPersistenceService.persistHistory({
      generationType: AIGenerationType.HOOKS,
      inputPayload: input as unknown as Record<string, unknown>,
      outputPayload: gen.data as unknown as Record<string, unknown>,
      model: gen.model,
      durationMs: gen.durationMs,
      userId,
    });

    return {
      data: gen.data,
      durationMs: gen.durationMs,
      model: gen.model,
      historyId,
    };
  }

  static async generateHashtags(
    input: GenerateHashtagsInput,
    userId: string
  ): Promise<{ data: HashtagsOutput; durationMs: number; model: string; historyId: string }> {
    const limit = input.limit || 15;
    const prompt = `Task: Generate ${limit} relevant developer hashtags (between 10 and 25).\n<user_input>\nContent: ${input.content}\n</user_input>\nJSON Schema: { "hashtags": ["#tag1", "#tag2", ...] }`;
    const gen = await this.executeGeneration('hashtags', prompt, 0.3, 256, hashtagsOutputSchema, input.content);

    const historyId = await GenerationPersistenceService.persistHistory({
      generationType: AIGenerationType.HASHTAGS,
      inputPayload: input as unknown as Record<string, unknown>,
      outputPayload: gen.data as unknown as Record<string, unknown>,
      model: gen.model,
      durationMs: gen.durationMs,
      userId,
    });

    return {
      data: gen.data,
      durationMs: gen.durationMs,
      model: gen.model,
      historyId,
    };
  }

  static async generateCta(
    input: GenerateCtaInput,
    userId: string
  ): Promise<{ data: CtaOutput; durationMs: number; model: string; historyId: string }> {
    const prompt = `Task: Generate exactly 3 action-oriented Calls to Action.\n<user_input>\nGoal: ${input.goal}\nPlatform: ${input.platform || 'General'}\n</user_input>\nJSON Schema: { "ctas": ["string1", "string2", "string3"] }`;
    const gen = await this.executeGeneration('cta', prompt, 0.5, 256, ctaOutputSchema, input.goal);

    const historyId = await GenerationPersistenceService.persistHistory({
      generationType: AIGenerationType.CTA,
      inputPayload: input as unknown as Record<string, unknown>,
      outputPayload: gen.data as unknown as Record<string, unknown>,
      model: gen.model,
      durationMs: gen.durationMs,
      userId,
    });

    return {
      data: gen.data,
      durationMs: gen.durationMs,
      model: gen.model,
      historyId,
    };
  }

  static async generateRewrite(
    input: GenerateRewriteInput,
    userId: string
  ): Promise<{ data: RewriteOutput; durationMs: number; model: string; historyId: string }> {
    const prompt = `Task: Rewrite the following developer text with mode ${input.mode || 'REWRITE'}.\n<user_input>\nText: ${input.text}\nTone: ${input.targetTone || 'engaging'}\n</user_input>\nJSON Schema: { "rewrittenText": "string", "mode": "${input.mode || 'REWRITE'}", "targetTone": "string" }`;
    const gen = await this.executeGeneration('rewrite', prompt, 0.5, 768, rewriteOutputSchema, input.text);

    const historyId = await GenerationPersistenceService.persistHistory({
      generationType: AIGenerationType.REWRITE,
      inputPayload: input as unknown as Record<string, unknown>,
      outputPayload: gen.data as unknown as Record<string, unknown>,
      model: gen.model,
      durationMs: gen.durationMs,
      userId,
    });

    return {
      data: gen.data,
      durationMs: gen.durationMs,
      model: gen.model,
      historyId,
    };
  }

  static async generateCarousel(
    input: GenerateCarouselInput,
    userId: string
  ): Promise<{ data: CarouselOutput; durationMs: number; model: string; historyId: string }> {
    const slidesCount = input.slidesCount || 7;
    const prompt = buildCarouselPrompt({
      topic: input.topic,
      slidesCount,
      tone: input.tone,
      targetAudience: input.targetAudience,
      additionalInstructions: input.additionalInstructions,
    });

    const schema = createCarouselOutputSchema(slidesCount);

    const gen = await this.executeGeneration(
      'carousel',
      prompt,
      0.6,
      1536,
      schema,
      input.topic
    );

    const historyId = await GenerationPersistenceService.persistHistory({
      generationType: AIGenerationType.CAROUSEL,
      inputPayload: input as unknown as Record<string, unknown>,
      outputPayload: gen.data as unknown as Record<string, unknown>,
      model: gen.model,
      durationMs: gen.durationMs,
      userId,
    });

    return {
      data: gen.data,
      durationMs: gen.durationMs,
      model: gen.model,
      historyId,
    };
  }

  static async generateReelScript(
    input: GenerateReelScriptInput,
    userId: string
  ): Promise<{ data: ReelScriptOutput; durationMs: number; model: string; historyId: string }> {
    const duration = input.duration || 60;
    const platform = input.platform || 'INSTAGRAM_REELS';
    const prompt = buildReelScriptPrompt({
      topic: input.topic,
      duration,
      platform,
      targetAudience: input.targetAudience,
      tone: input.tone,
      language: input.language,
      additionalInstructions: input.additionalInstructions,
    });

    const schema = createReelScriptOutputSchema({
      duration,
      platform,
      topic: input.topic,
    });

    const gen = await this.executeGeneration(
      'reel-script',
      prompt,
      0.6,
      2048,
      schema,
      input.topic
    );

    const historyId = await GenerationPersistenceService.persistHistory({
      generationType: AIGenerationType.REEL_SCRIPT,
      inputPayload: input as unknown as Record<string, unknown>,
      outputPayload: gen.data as unknown as Record<string, unknown>,
      model: gen.model,
      durationMs: gen.durationMs,
      userId,
    });

    return {
      data: gen.data,
      durationMs: gen.durationMs,
      model: gen.model,
      historyId,
    };
  }
}
