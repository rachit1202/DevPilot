import {
  generateIdeasInputSchema,
  generateCaptionInputSchema,
  generateHooksInputSchema,
  generateHashtagsInputSchema,
  generateCtaInputSchema,
  generateRewriteInputSchema,
  generateCarouselInputSchema,
  GenerateIdeasInput,
  GenerateCaptionInput,
  GenerateHooksInput,
  GenerateHashtagsInput,
  GenerateCtaInput,
  GenerateRewriteInput,
  GenerateCarouselInput,
  IdeasOutput,
  CaptionOutput,
  HooksOutput,
  HashtagsOutput,
  CtaOutput,
  RewriteOutput,
  CarouselOutput,
  CarouselSlide,
} from '@devpilot/validation';
import { AIStatusData } from '../../lib/ai-api';
import { ApiError } from '../../lib/api';

// ==========================================
// 1. TOOL IDENTIFIERS & TYPES
// ==========================================

export type StudioToolId = 'ideas' | 'caption' | 'hooks' | 'hashtags' | 'cta' | 'rewrite' | 'carousel';

export interface StudioToolConfig {
  id: StudioToolId;
  name: string;
  badge: string;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  minChars: number;
  maxChars: number;
}

export const STUDIO_TOOLS: Record<StudioToolId, StudioToolConfig> = {
  carousel: {
    id: 'carousel',
    name: 'Carousel Outline',
    badge: '5–10 Slides',
    description: 'Generate complete slide-by-slide carousel outlines with cover, body, CTA, and visual cues.',
    inputLabel: 'Topic or Concept',
    inputPlaceholder: 'e.g. 5 system design patterns every senior engineer should know...',
    minChars: 5,
    maxChars: 500,
  },
  ideas: {
    id: 'ideas',
    name: 'Content Ideas',
    badge: '3 Concepts',
    description: 'Brainstorm fresh technical angles and content concepts tailored to developers.',
    inputLabel: 'Topic or Theme',
    inputPlaceholder: 'e.g. Microservices vs Monoliths in 2026, TypeScript 5.5 features...',
    minChars: 5,
    maxChars: 500,
  },
  caption: {
    id: 'caption',
    name: 'Caption Generator',
    badge: 'Full Post',
    description: 'Draft complete social media posts with title, hook, body, hashtags, and CTA.',
    inputLabel: 'Topic or Context',
    inputPlaceholder: 'e.g. Why we migrated from Jest to Vitest and cut CI time by 60%...',
    minChars: 5,
    maxChars: 1000,
  },
  hooks: {
    id: 'hooks',
    name: 'Hook Generator',
    badge: '5 Hooks',
    description: 'Generate high-converting opening hooks designed to stop the scroll.',
    inputLabel: 'Topic or Main Point',
    inputPlaceholder: 'e.g. The hidden cost of prematurely adding Kubernetes...',
    minChars: 5,
    maxChars: 500,
  },
  hashtags: {
    id: 'hashtags',
    name: 'Hashtag Generator',
    badge: '10–25 Tags',
    description: 'Extract relevant developer hashtags to maximize discoverability.',
    inputLabel: 'Post Content or Summary',
    inputPlaceholder: 'e.g. Next.js 15 Server Actions best practices for robust forms...',
    minChars: 3,
    maxChars: 300,
  },
  cta: {
    id: 'cta',
    name: 'CTA Generator',
    badge: '3 CTAs',
    description: 'Generate platform-tailored calls to action that drive comments and clicks.',
    inputLabel: 'Desired Outcome or Goal',
    inputPlaceholder: 'e.g. Encourage developers to share their production horror stories...',
    minChars: 5,
    maxChars: 500,
  },
  rewrite: {
    id: 'rewrite',
    name: 'Content Rewriter',
    badge: 'Refine & Polish',
    description: 'Rewrite, expand, or adjust the tone of existing technical drafts.',
    inputLabel: 'Text to Rewrite',
    inputPlaceholder: 'Paste draft text, raw thoughts, or code explanations to polish...',
    minChars: 10,
    maxChars: 3000,
  },
};

// ==========================================
// 2. INPUT STATE INTERFACES
// ==========================================

export interface IdeasFormState {
  topic: string;
  targetAudience: string;
  contentType: 'POST' | 'REEL' | 'STORY' | 'CAROUSEL' | '';
}

export interface CaptionFormState {
  topic: string;
  tone: string;
}

export interface HooksFormState {
  topic: string;
  style: string;
}

export interface HashtagsFormState {
  content: string;
  limit: number;
}

export interface CtaFormState {
  goal: string;
  platform: 'INSTAGRAM' | 'FACEBOOK' | 'WHATSAPP' | 'X' | '';
}

export interface RewriteFormState {
  text: string;
  mode: 'REWRITE' | 'SHORTEN' | 'EXPAND' | 'TONE_ADJUST';
  targetTone: string;
}

export interface CarouselFormState {
  topic: string;
  tone: string;
  slidesCount: number;
  targetAudience: string;
  additionalInstructions: string;
}

export interface StudioFormsState {
  ideas: IdeasFormState;
  caption: CaptionFormState;
  hooks: HooksFormState;
  hashtags: HashtagsFormState;
  cta: CtaFormState;
  rewrite: RewriteFormState;
  carousel: CarouselFormState;
}

export const INITIAL_FORMS_STATE: StudioFormsState = {
  carousel: {
    topic: '',
    tone: '',
    slidesCount: 7,
    targetAudience: '',
    additionalInstructions: '',
  },
  ideas: {
    topic: '',
    targetAudience: '',
    contentType: '',
  },
  caption: {
    topic: '',
    tone: '',
  },
  hooks: {
    topic: '',
    style: '',
  },
  hashtags: {
    content: '',
    limit: 15,
  },
  cta: {
    goal: '',
    platform: '',
  },
  rewrite: {
    text: '',
    mode: 'REWRITE',
    targetTone: '',
  },
};

// ==========================================
// 3. ENGINE READINESS GATING
// ==========================================

export interface EngineGateResult {
  canGenerate: boolean;
  reason: string | null;
  code: 'OK' | 'LOADING' | 'OFFLINE' | 'GENERATING' | 'RECOVERY_REQUIRED' | 'INVALID_INPUT';
}

/**
 * Authoritative frontend engine readiness check.
 * Disables generation when:
 * 1. Engine status is still loading.
 * 2. Ollama is offline or status is null.
 * 3. Engine status is 'GENERATING'.
 * 4. Engine status is 'RECOVERY_REQUIRED'.
 */
export function checkEngineReadiness(
  status: AIStatusData | null,
  isStatusLoading: boolean,
  isGenerating: boolean
): EngineGateResult {
  if (isGenerating) {
    return {
      canGenerate: false,
      reason: 'A generation request is currently processing.',
      code: 'GENERATING',
    };
  }

  if (isStatusLoading && !status) {
    return {
      canGenerate: false,
      reason: 'Verifying AI Engine availability...',
      code: 'LOADING',
    };
  }

  if (!status || !status.online) {
    return {
      canGenerate: false,
      reason: 'AI Engine is offline. Please ensure Ollama is running locally.',
      code: 'OFFLINE',
    };
  }

  if (status.engineStatus === 'RECOVERY_REQUIRED') {
    return {
      canGenerate: false,
      reason: status.lockReason || 'AI Engine requires administrative recovery before new requests can run.',
      code: 'RECOVERY_REQUIRED',
    };
  }

  if (status.engineStatus === 'GENERATING') {
    return {
      canGenerate: false,
      reason: `AI Engine is busy with active inference (${status.model}).`,
      code: 'GENERATING',
    };
  }

  return {
    canGenerate: true,
    reason: null,
    code: 'OK',
  };
}

// ==========================================
// 4. CLIENT-SIDE VALIDATION HELPERS
// ==========================================

export interface ToolValidationResult<T> {
  isValid: boolean;
  errorMessage: string | null;
  payload: T | null;
}

export function validateIdeasInput(form: IdeasFormState): ToolValidationResult<GenerateIdeasInput> {
  const raw: Record<string, unknown> = {
    topic: form.topic.trim(),
  };
  if (form.targetAudience.trim()) {
    raw.targetAudience = form.targetAudience.trim();
  }
  if (form.contentType) {
    raw.contentType = form.contentType;
  }

  const parsed = generateIdeasInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      isValid: false,
      errorMessage: parsed.error.issues[0]?.message || 'Invalid Ideas input.',
      payload: null,
    };
  }
  return { isValid: true, errorMessage: null, payload: parsed.data };
}

export function validateCaptionInput(form: CaptionFormState): ToolValidationResult<GenerateCaptionInput> {
  const raw: Record<string, unknown> = {
    topic: form.topic.trim(),
  };
  if (form.tone.trim()) {
    raw.tone = form.tone.trim();
  }

  const parsed = generateCaptionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      isValid: false,
      errorMessage: parsed.error.issues[0]?.message || 'Invalid Caption input.',
      payload: null,
    };
  }
  return { isValid: true, errorMessage: null, payload: parsed.data };
}

export function validateHooksInput(form: HooksFormState): ToolValidationResult<GenerateHooksInput> {
  const raw: Record<string, unknown> = {
    topic: form.topic.trim(),
  };
  if (form.style.trim()) {
    raw.style = form.style.trim();
  }

  const parsed = generateHooksInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      isValid: false,
      errorMessage: parsed.error.issues[0]?.message || 'Invalid Hooks input.',
      payload: null,
    };
  }
  return { isValid: true, errorMessage: null, payload: parsed.data };
}

export function validateHashtagsInput(form: HashtagsFormState): ToolValidationResult<GenerateHashtagsInput> {
  const raw = {
    content: form.content.trim(),
    limit: Number(form.limit) || 15,
  };

  const parsed = generateHashtagsInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      isValid: false,
      errorMessage: parsed.error.issues[0]?.message || 'Invalid Hashtags input.',
      payload: null,
    };
  }
  return { isValid: true, errorMessage: null, payload: parsed.data };
}

export function validateCtaInput(form: CtaFormState): ToolValidationResult<GenerateCtaInput> {
  const raw: Record<string, unknown> = {
    goal: form.goal.trim(),
  };
  if (form.platform) {
    raw.platform = form.platform;
  }

  const parsed = generateCtaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      isValid: false,
      errorMessage: parsed.error.issues[0]?.message || 'Invalid CTA input.',
      payload: null,
    };
  }
  return { isValid: true, errorMessage: null, payload: parsed.data };
}

export function validateRewriteInput(form: RewriteFormState): ToolValidationResult<GenerateRewriteInput> {
  const raw: Record<string, unknown> = {
    text: form.text.trim(),
    mode: form.mode || 'REWRITE',
  };
  if (form.targetTone.trim()) {
    raw.targetTone = form.targetTone.trim();
  }

  const parsed = generateRewriteInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      isValid: false,
      errorMessage: parsed.error.issues[0]?.message || 'Invalid Rewrite input.',
      payload: null,
    };
  }
  return { isValid: true, errorMessage: null, payload: parsed.data };
}

export function validateCarouselInput(form: CarouselFormState): ToolValidationResult<GenerateCarouselInput> {
  const raw: Record<string, unknown> = {
    topic: form.topic.trim(),
    slidesCount: typeof form.slidesCount === 'number' ? form.slidesCount : Number(form.slidesCount) || 7,
  };
  if (form.tone.trim()) {
    raw.tone = form.tone.trim();
  }
  if (form.targetAudience.trim()) {
    raw.targetAudience = form.targetAudience.trim();
  }
  if (form.additionalInstructions.trim()) {
    raw.additionalInstructions = form.additionalInstructions.trim();
  }

  const parsed = generateCarouselInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      isValid: false,
      errorMessage: parsed.error.issues[0]?.message || 'Invalid Carousel input.',
      payload: null,
    };
  }
  return { isValid: true, errorMessage: null, payload: parsed.data };
}

// ==========================================
// 5. ERROR MESSAGE NORMALIZATION
// ==========================================

export function formatAIErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'The AI engine is currently busy with another generation. Please wait a moment and try again.';
    }
    if (error.status === 504) {
      return 'AI generation timed out. The local model took too long to complete inference.';
    }
    if (error.status === 503) {
      return 'AI engine service is unavailable. Please ensure Ollama is running.';
    }
    if (error.status === 400) {
      return error.message || 'Validation error: please verify your input parameters.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'Authentication session expired. Please refresh the page or log in again.';
    }
    if (error.status === 0) {
      return 'Network connection error or backend server unreachable.';
    }
    return error.message || `Request failed (HTTP ${error.status})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred during generation.';
}

// ==========================================
// 6. COPY FORMATTERS FOR OUTPUT CARDS
// ==========================================

export function formatIdeasForCopy(data: IdeasOutput): string {
  return data.ideas
    .map(
      (idea, index) =>
        `Idea #${index + 1}: ${idea.title}\nFormat: ${idea.suggestedFormat} | Angle: ${idea.angle}\n${idea.concept}`
    )
    .join('\n\n---\n\n');
}

export function formatCaptionForCopy(data: CaptionOutput): string {
  const parts: string[] = [];
  if (data.title) parts.push(data.title);
  if (data.hook) parts.push(data.hook);
  if (data.caption) parts.push(data.caption);
  if (data.cta) parts.push(data.cta);
  if (data.hashtags && data.hashtags.length > 0) {
    parts.push(data.hashtags.join(' '));
  }
  return parts.join('\n\n');
}

export function formatHooksForCopy(data: HooksOutput): string {
  return data.hooks.map((hook, i) => `${i + 1}. ${hook}`).join('\n\n');
}

export function formatHashtagsForCopy(data: HashtagsOutput): string {
  return data.hashtags.join(' ');
}

export function formatCtaForCopy(data: CtaOutput): string {
  return data.ctas.map((cta, i) => `${i + 1}. ${cta}`).join('\n\n');
}

export function formatRewriteForCopy(data: RewriteOutput): string {
  return data.rewrittenText;
}

export function formatCarouselSlideForCopy(slide: CarouselSlide): string {
  const parts: string[] = [
    `[Slide ${slide.slideNumber}: ${slide.slideType}] ${slide.title}`,
    slide.content,
  ];
  if (slide.hook) {
    parts.push(`Hook: ${slide.hook}`);
  }
  if (slide.cta) {
    parts.push(`CTA: ${slide.cta}`);
  }
  if (slide.visualDirection) {
    parts.push(`Visual Direction: ${slide.visualDirection}`);
  }
  return parts.join('\n');
}

export function formatCarouselForCopy(data: CarouselOutput): string {
  const headerParts: string[] = [`# ${data.title}`, `Topic: ${data.topic}`];
  if (data.targetAudience) {
    headerParts.push(`Target Audience: ${data.targetAudience}`);
  }
  headerParts.push(`Total Slides: ${data.slides.length}`);

  const slidesFormatted = data.slides.map(formatCarouselSlideForCopy).join('\n\n---\n\n');
  return `${headerParts.join('\n')}\n\n---\n\n${slidesFormatted}`;
}

// ==========================================
// 7. SAFE CLIPBOARD UTILITY
// ==========================================

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue to DOM fallback below
  }

  try {
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  } catch {
    return false;
  }

  return false;
}
