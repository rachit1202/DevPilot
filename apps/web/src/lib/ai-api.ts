import { apiRequest } from './api';
import {
  GenerateIdeasInput,
  GenerateCaptionInput,
  GenerateHooksInput,
  GenerateHashtagsInput,
  GenerateCtaInput,
  GenerateRewriteInput,
  SaveToDraftInput,
  IdeasOutput,
  CaptionOutput,
  HooksOutput,
  HashtagsOutput,
  CtaOutput,
  RewriteOutput,
} from '@devpilot/validation';
import { ContentType, ContentCategory, PostStatus } from '@devpilot/shared';

// ==========================================
// 1. AI STATUS TYPES
// ==========================================

export type AIEngineStatus = 'IDLE' | 'GENERATING' | 'RECOVERY_REQUIRED';

export interface AIStatusData {
  provider: 'ollama';
  model: string;
  online: boolean;
  version: string | null;
  engineStatus: AIEngineStatus;
  isEngineOwner: boolean;
  lockReason: string | null;
}

export interface AIStatusResponse {
  success: boolean;
  data: AIStatusData;
}

// ==========================================
// 2. GENERATION RESPONSE TYPES
// ==========================================

export interface AIGenerationMeta {
  historyId: string;
  model: string;
  durationMs: number;
}

export interface AIGenerationResponse<T> {
  success: boolean;
  data: T;
  meta: AIGenerationMeta;
}

export type IdeasGenerationResponse = AIGenerationResponse<IdeasOutput>;
export type CaptionGenerationResponse = AIGenerationResponse<CaptionOutput>;
export type HooksGenerationResponse = AIGenerationResponse<HooksOutput>;
export type HashtagsGenerationResponse = AIGenerationResponse<HashtagsOutput>;
export type CtaGenerationResponse = AIGenerationResponse<CtaOutput>;
export type RewriteGenerationResponse = AIGenerationResponse<RewriteOutput>;

// ==========================================
// 3. GENERATION HISTORY TYPES
// ==========================================

export type AIGenerationType = 'IDEAS' | 'CAPTION' | 'HOOKS' | 'HASHTAGS' | 'CTA' | 'REWRITE' | 'CAROUSEL';

export interface AIHistoryItem {
  id: string;
  generationType: AIGenerationType;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  model: string;
  durationMs: number;
  userId: string;
  resultingPostId: string | null;
  createdAt: string;
}

export interface AIHistoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AIHistoryListResponse {
  success: boolean;
  data: AIHistoryItem[];
  pagination: AIHistoryPagination;
}

export interface AIHistoryItemResponse {
  success: boolean;
  data: AIHistoryItem;
}

export interface AIHistoryDeleteResponse {
  success: boolean;
  message: string;
}

export interface AIHistoryQueryParams {
  page?: number;
  limit?: number;
  generationType?: AIGenerationType;
  allUsers?: boolean;
  targetUserId?: string;
  startDate?: string;
  endDate?: string;
}

// ==========================================
// 4. SAVE-TO-DRAFT TYPES
// ==========================================

export interface CreatedDraftPost {
  id: string;
  title: string;
  caption: string;
  hashtags: string[];
  cta: string | null;
  status: PostStatus;
  contentType: ContentType;
  category: ContentCategory;
  sourceType: string;
  createdById: string;
  createdAt: string;
}

export interface SaveToDraftData {
  post: CreatedDraftPost;
  history: {
    id: string;
    resultingPostId: string;
  };
}

export interface SaveToDraftResponse {
  success: boolean;
  data: SaveToDraftData;
}

// ==========================================
// 5. API CLIENT FUNCTIONS
// ==========================================

/**
 * Retrieves the current Ollama connection health and mutex engine state.
 * Accessible to any authenticated user.
 */
export async function getAIStatus(): Promise<AIStatusResponse> {
  return apiRequest<AIStatusResponse>('/ai/status', {
    method: 'GET',
  });
}

/**
 * Generates 3 developer content ideas.
 */
export async function generateIdeas(payload: GenerateIdeasInput): Promise<IdeasGenerationResponse> {
  return apiRequest<IdeasGenerationResponse>('/ai/generate/ideas', {
    method: 'POST',
    data: payload,
  });
}

/**
 * Generates an end-to-end post caption with title, hook, caption, cta, and hashtags.
 */
export async function generateCaption(payload: GenerateCaptionInput): Promise<CaptionGenerationResponse> {
  return apiRequest<CaptionGenerationResponse>('/ai/generate/caption', {
    method: 'POST',
    data: payload,
  });
}

/**
 * Generates 5 compelling developer hooks.
 */
export async function generateHooks(payload: GenerateHooksInput): Promise<HooksGenerationResponse> {
  return apiRequest<HooksGenerationResponse>('/ai/generate/hooks', {
    method: 'POST',
    data: payload,
  });
}

/**
 * Generates 10-25 high-relevance hashtags.
 */
export async function generateHashtags(payload: GenerateHashtagsInput): Promise<HashtagsGenerationResponse> {
  return apiRequest<HashtagsGenerationResponse>('/ai/generate/hashtags', {
    method: 'POST',
    data: payload,
  });
}

/**
 * Generates 3 platform-tailored CTAs.
 */
export async function generateCta(payload: GenerateCtaInput): Promise<CtaGenerationResponse> {
  return apiRequest<CtaGenerationResponse>('/ai/generate/cta', {
    method: 'POST',
    data: payload,
  });
}

/**
 * Rewrites developer text according to mode and tone.
 */
export async function generateRewrite(payload: GenerateRewriteInput): Promise<RewriteGenerationResponse> {
  return apiRequest<RewriteGenerationResponse>('/ai/generate/rewrite', {
    method: 'POST',
    data: payload,
  });
}

/**
 * Retrieves paginated generation history with optional filters.
 */
export async function getAIHistory(query: AIHistoryQueryParams = {}): Promise<AIHistoryListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.append('page', String(query.page));
  if (query.limit) params.append('limit', String(query.limit));
  if (query.generationType) params.append('generationType', query.generationType);
  if (query.allUsers !== undefined) params.append('allUsers', String(query.allUsers));
  if (query.targetUserId) params.append('targetUserId', query.targetUserId);
  if (query.startDate) params.append('startDate', query.startDate);
  if (query.endDate) params.append('endDate', query.endDate);

  const qs = params.toString();
  const endpoint = qs ? `/ai/history?${qs}` : '/ai/history';

  return apiRequest<AIHistoryListResponse>(endpoint, {
    method: 'GET',
  });
}

/**
 * Retrieves a single generation history record by ID.
 */
export async function getAIHistoryItem(id: string): Promise<AIHistoryItemResponse> {
  return apiRequest<AIHistoryItemResponse>(`/ai/history/${id}`, {
    method: 'GET',
  });
}

/**
 * Deletes a single generation history record by ID.
 */
export async function deleteAIHistoryItem(id: string): Promise<AIHistoryDeleteResponse> {
  return apiRequest<AIHistoryDeleteResponse>(`/ai/history/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Promotes a generation history record into a ContentPost Draft.
 */
export async function saveToDraft(id: string, payload: SaveToDraftInput): Promise<SaveToDraftResponse> {
  return apiRequest<SaveToDraftResponse>(`/ai/history/${id}/save-to-draft`, {
    method: 'POST',
    data: payload,
  });
}
