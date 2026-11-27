import { SaveToDraftInput, saveToDraftSchema } from '@devpilot/validation';
import { UserRole } from '@devpilot/shared';
import { ApiError } from '../../lib/api';
import { StudioToolId } from './ai-studio-logic';

// ==========================================
// 1. RBAC PERMISSIONS FOR SAVE-TO-DRAFT
// ==========================================

/**
 * Checks if the user's role is authorized to promote AI history to a ContentPost Draft.
 * Approved roles: OWNER, ADMIN, EDITOR.
 * Unauthorized roles: APPROVER, ANALYST, and unauthenticated users.
 */
export function canUserPromoteToDraft(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  return role === UserRole.OWNER || role === UserRole.ADMIN || role === UserRole.EDITOR;
}

// ==========================================
// 2. MODAL FORM STATE INTERFACES
// ==========================================

export interface SaveToDraftFormState {
  selectedIdeaIndex: number | null;
  selectedHookIndex: number | null;
  title: string;
  caption: string;
}

export const INITIAL_SAVE_TO_DRAFT_FORM_STATE: SaveToDraftFormState = {
  selectedIdeaIndex: null,
  selectedHookIndex: null,
  title: '',
  caption: '',
};

export interface SaveToDraftValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  payload: SaveToDraftInput | null;
  isSupported: boolean;
}

// ==========================================
// 3. GENERATION TYPE SPECIFIC VALIDATORS
// ==========================================

/**
 * Validates modal form state and builds the exact canonical SaveToDraftInput
 * payload expected by POST /api/v1/ai/history/:id/save-to-draft.
 */
export function validateSaveToDraftForm(
  toolId: StudioToolId,
  form: SaveToDraftFormState,
  outputData: any
): SaveToDraftValidationResult {
  // A. CTA and HASHTAGS: direct promotion is unsupported
  if (toolId === 'cta' || toolId === 'hashtags') {
    return {
      isValid: false,
      errorMessage:
        toolId === 'cta'
          ? 'Calls to action cannot be directly promoted to an independent draft. Use Copy to insert this CTA into an existing draft.'
          : 'Hashtag collections cannot be directly promoted to an independent draft. Use Copy to insert these hashtags into an existing draft.',
      payload: null,
      isSupported: false,
    };
  }

  // B. CAPTION: fully mapped by backend, no override fields permitted
  if (toolId === 'caption') {
    if (!outputData || typeof outputData !== 'object' || !outputData.title || !outputData.caption) {
      return {
        isValid: false,
        errorMessage: 'Generation output is missing title or caption data.',
        payload: null,
        isSupported: true,
      };
    }

    // Body payload must be empty object (no client overrides)
    const payload: SaveToDraftInput = {};
    const parsed = saveToDraftSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        isValid: false,
        errorMessage: parsed.error.issues[0]?.message || 'Invalid payload for Caption draft.',
        payload: null,
        isSupported: true,
      };
    }

    return {
      isValid: true,
      errorMessage: null,
      payload: parsed.data,
      isSupported: true,
    };
  }

  // C. IDEAS: requires selectedIdeaIndex (0..2), no title/caption overrides
  if (toolId === 'ideas') {
    if (
      form.selectedIdeaIndex === null ||
      form.selectedIdeaIndex === undefined ||
      form.selectedIdeaIndex < 0 ||
      form.selectedIdeaIndex > 2
    ) {
      return {
        isValid: false,
        errorMessage: 'Please select one of the three generated ideas to promote.',
        payload: null,
        isSupported: true,
      };
    }

    if (!outputData?.ideas || !outputData.ideas[form.selectedIdeaIndex]) {
      return {
        isValid: false,
        errorMessage: 'Selected idea is not present in generation output.',
        payload: null,
        isSupported: true,
      };
    }

    const payload: SaveToDraftInput = {
      selectedIdeaIndex: form.selectedIdeaIndex,
    };
    const parsed = saveToDraftSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        isValid: false,
        errorMessage: parsed.error.issues[0]?.message || 'Invalid payload for Ideas draft.',
        payload: null,
        isSupported: true,
      };
    }

    return {
      isValid: true,
      errorMessage: null,
      payload: parsed.data,
      isSupported: true,
    };
  }

  // D. REWRITE: requires title (3..200 chars), caption taken from persisted rewrittenText
  if (toolId === 'rewrite') {
    const trimmedTitle = form.title.trim();
    if (trimmedTitle.length < 3) {
      return {
        isValid: false,
        errorMessage: 'Title must be at least 3 characters.',
        payload: null,
        isSupported: true,
      };
    }
    if (trimmedTitle.length > 200) {
      return {
        isValid: false,
        errorMessage: 'Title must not exceed 200 characters.',
        payload: null,
        isSupported: true,
      };
    }

    if (!outputData?.rewrittenText) {
      return {
        isValid: false,
        errorMessage: 'Rewritten content is missing from generation output.',
        payload: null,
        isSupported: true,
      };
    }

    const payload: SaveToDraftInput = {
      title: trimmedTitle,
    };
    const parsed = saveToDraftSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        isValid: false,
        errorMessage: parsed.error.issues[0]?.message || 'Invalid payload for Rewrite draft.',
        payload: null,
        isSupported: true,
      };
    }

    return {
      isValid: true,
      errorMessage: null,
      payload: parsed.data,
      isSupported: true,
    };
  }

  // E. HOOKS: requires selectedHookIndex (0..4), title (3..200 chars), caption (5..10000 chars)
  if (toolId === 'hooks') {
    if (
      form.selectedHookIndex === null ||
      form.selectedHookIndex === undefined ||
      form.selectedHookIndex < 0 ||
      form.selectedHookIndex > 4
    ) {
      return {
        isValid: false,
        errorMessage: 'Please select one of the five generated hooks.',
        payload: null,
        isSupported: true,
      };
    }

    if (!outputData?.hooks || !outputData.hooks[form.selectedHookIndex]) {
      return {
        isValid: false,
        errorMessage: 'Selected hook is not present in generation output.',
        payload: null,
        isSupported: true,
      };
    }

    const trimmedTitle = form.title.trim();
    if (trimmedTitle.length < 3) {
      return {
        isValid: false,
        errorMessage: 'Post title must be at least 3 characters.',
        payload: null,
        isSupported: true,
      };
    }
    if (trimmedTitle.length > 200) {
      return {
        isValid: false,
        errorMessage: 'Post title must not exceed 200 characters.',
        payload: null,
        isSupported: true,
      };
    }

    const trimmedCaption = form.caption.trim();
    if (trimmedCaption.length < 5) {
      return {
        isValid: false,
        errorMessage: 'Post body must be at least 5 characters.',
        payload: null,
        isSupported: true,
      };
    }
    if (trimmedCaption.length > 10000) {
      return {
        isValid: false,
        errorMessage: 'Post body must not exceed 10,000 characters.',
        payload: null,
        isSupported: true,
      };
    }

    const payload: SaveToDraftInput = {
      selectedHookIndex: form.selectedHookIndex,
      title: trimmedTitle,
      caption: trimmedCaption,
    };
    const parsed = saveToDraftSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        isValid: false,
        errorMessage: parsed.error.issues[0]?.message || 'Invalid payload for Hooks draft.',
        payload: null,
        isSupported: true,
      };
    }

    return {
      isValid: true,
      errorMessage: null,
      payload: parsed.data,
      isSupported: true,
    };
  }

  return {
    isValid: false,
    errorMessage: 'Unsupported tool generation type.',
    payload: null,
    isSupported: false,
  };
}

// ==========================================
// 4. ERROR MESSAGE NORMALIZATION
// ==========================================

/**
 * Normalizes backend Save-to-Draft error codes into clear, user-friendly messages.
 */
export function formatSaveToDraftError(error: unknown): string {
  if (error instanceof ApiError) {
    const rawMsg = error.message || '';

    if (error.status === 409 || rawMsg.includes('DRAFT_ALREADY_EXISTS')) {
      return 'A ContentPost draft has already been created from this generation history record.';
    }
    if (error.status === 403) {
      if (rawMsg.includes('CROSS_USER_PROMOTION_FORBIDDEN')) {
        return 'Permission denied: You can only promote AI generation history records that you created.';
      }
      return 'Permission denied: Your current role does not have permission to create drafts.';
    }
    if (error.status === 404 || rawMsg.includes('HISTORY_RECORD_NOT_FOUND')) {
      return 'Generation history record was not found or has been deleted.';
    }
    if (error.status === 422 || rawMsg.includes('SAVE_TO_DRAFT_UNSUPPORTED')) {
      return 'Direct Save-to-Draft is not supported for this generation type.';
    }
    if (error.status === 400 || rawMsg.includes('VALIDATION_ERROR')) {
      return rawMsg.replace(/^VALIDATION_ERROR:\s*/, '') || 'Invalid parameters supplied for draft creation.';
    }
    if (error.status === 401) {
      return 'Your session has expired. Please log in again to save drafts.';
    }
    if (error.status === 0) {
      return 'Network error or backend server unreachable. Please check connection.';
    }

    return rawMsg || `Request failed (HTTP ${error.status})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred while saving draft.';
}
