import { UserRole } from '@devpilot/shared';
import { AIGenerationType, AIHistoryQueryParams } from '../../lib/ai-api';
import { ApiError } from '../../lib/api';

// ==========================================
// 1. RBAC PERMISSIONS FOR AI HISTORY
// ==========================================

export interface AIHistoryUserPermissions {
  canAccessHistory: boolean;
  canViewOtherUsers: boolean;
  canDeleteOtherUsers: boolean;
}

/**
 * Derives user permissions for AI History based on UserRole.
 *
 * RBAC Matrix:
 * - OWNER: Own history (Yes), Other users read (Only explicit scope), Own delete (Yes), Other users delete (Only explicit scope)
 * - ADMIN: Own history (Yes), Other users read (Only explicit scope), Own delete (Yes), Other users delete (Only explicit scope)
 * - EDITOR: Own history (Yes), Other users read (No), Own delete (Yes), Other users delete (No)
 * - APPROVER: Own history (Yes), Other users read (No), Own delete (Yes), Other users delete (No)
 * - ANALYST: No history access (Read: No, Delete: No)
 */
export function getAIHistoryPermissions(role: UserRole | string | undefined | null): AIHistoryUserPermissions {
  if (!role) {
    return {
      canAccessHistory: false,
      canViewOtherUsers: false,
      canDeleteOtherUsers: false,
    };
  }

  if (role === UserRole.ANALYST) {
    return {
      canAccessHistory: false,
      canViewOtherUsers: false,
      canDeleteOtherUsers: false,
    };
  }

  const isOwnerOrAdmin = role === UserRole.OWNER || role === UserRole.ADMIN;

  return {
    canAccessHistory: true,
    canViewOtherUsers: isOwnerOrAdmin,
    canDeleteOtherUsers: isOwnerOrAdmin,
  };
}

// ==========================================
// 2. QUERY BUILDER & SCOPE NORMALIZATION
// ==========================================

export interface AIHistoryFilterState {
  page: number;
  limit: number;
  generationType: AIGenerationType | 'ALL';
  allUsers: boolean;
  targetUserId: string;
  startDate: string;
  endDate: string;
}

export const INITIAL_HISTORY_FILTER_STATE: AIHistoryFilterState = {
  page: 1,
  limit: 10,
  generationType: 'ALL',
  allUsers: false,
  targetUserId: '',
  startDate: '',
  endDate: '',
};

/**
 * Builds canonical query parameters for getAIHistory().
 * Enforces that non-privileged roles can NEVER transmit allUsers or targetUserId.
 */
export function buildHistoryQueryParams(
  filters: AIHistoryFilterState,
  userRole: UserRole | string | undefined | null
): AIHistoryQueryParams {
  const perms = getAIHistoryPermissions(userRole);
  const query: AIHistoryQueryParams = {
    page: filters.page > 0 ? filters.page : 1,
    limit: filters.limit > 0 ? filters.limit : 10,
  };

  if (filters.generationType !== 'ALL') {
    query.generationType = filters.generationType;
  }

  // Cross-user scopes only if role is authorized and explicitly enabled
  if (perms.canViewOtherUsers) {
    if (filters.allUsers) {
      query.allUsers = true;
    } else if (filters.targetUserId.trim()) {
      query.targetUserId = filters.targetUserId.trim();
    }
  }

  // Date range filters (must be valid ISO or YYYY-MM-DD that can be converted)
  if (filters.startDate) {
    query.startDate = new Date(filters.startDate).toISOString();
  }
  if (filters.endDate) {
    query.endDate = new Date(filters.endDate).toISOString();
  }

  return query;
}

// ==========================================
// 3. ERROR NORMALIZATION
// ==========================================

export function formatHistoryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const rawMsg = error.message || '';
    if (error.status === 401) {
      return 'Your session has expired. Please log in again to view generation history.';
    }
    if (error.status === 403) {
      if (rawMsg.includes('Analysts have read-only permissions')) {
        return 'Access restricted: Analyst role does not have permission to access AI generation history.';
      }
      return 'Access denied: You do not have permission to view or manage this history scope.';
    }
    if (error.status === 404) {
      return 'The requested generation history record was not found or has been deleted.';
    }
    if (error.status === 0) {
      return 'Network error: Unable to reach the server. Please check your connection.';
    }
    return rawMsg || `Request failed with status ${error.status}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred while communicating with history service.';
}

export function formatHistoryDeleteError(error: unknown): string {
  if (error instanceof ApiError) {
    const rawMsg = error.message || '';
    if (error.status === 401) {
      return 'Your session has expired. Please log in again.';
    }
    if (error.status === 403) {
      return 'Permission denied: You do not have permission to delete this history record.';
    }
    if (error.status === 404) {
      return 'The history record could not be found. It may have already been deleted.';
    }
    if (error.status === 0) {
      return 'Network error: Unable to reach the server to delete the record.';
    }
    return rawMsg || `Failed to delete record (HTTP ${error.status})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred while deleting the history record.';
}
