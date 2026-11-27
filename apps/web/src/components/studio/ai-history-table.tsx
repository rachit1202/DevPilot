'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AIHistoryItem,
  AIHistoryPagination,
  getAIHistory,
  deleteAIHistoryItem,
  AIGenerationType,
} from '@/lib/ai-api';
import {
  AIHistoryFilterState,
  INITIAL_HISTORY_FILTER_STATE,
  buildHistoryQueryParams,
  getAIHistoryPermissions,
  formatHistoryErrorMessage,
  formatHistoryDeleteError,
} from './ai-history-logic';
import { AIHistoryDetailModal } from './ai-history-detail-modal';
import { AIHistoryDeleteDialog } from './ai-history-delete-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  RotateCcw,
  Clock,
  Cpu,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  Users,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserRole } from '@devpilot/shared';

export interface AIHistoryTableProps {
  userRole?: UserRole | string | null;
  currentUserId?: string | null;
  className?: string;
}

export function AIHistoryTable({
  userRole,
  currentUserId,
  className,
}: AIHistoryTableProps) {
  // 1. Role Permissions
  const permissions = useMemo(() => getAIHistoryPermissions(userRole), [userRole]);

  // 2. Filter & Pagination State
  const [filters, setFilters] = useState<AIHistoryFilterState>(INITIAL_HISTORY_FILTER_STATE);

  // 3. Data & Loading States
  const [records, setRecords] = useState<AIHistoryItem[]>([]);
  const [pagination, setPagination] = useState<AIHistoryPagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // 4. Modal Interactions: Detail and Delete
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<AIHistoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  // 5. Data Fetcher
  const fetchHistory = useCallback(async () => {
    if (!permissions.canAccessHistory) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const query = buildHistoryQueryParams(filters, userRole);
      const res = await getAIHistory(query);

      if (res && res.success && res.data) {
        setRecords(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } else {
        setErrorMessage('Failed to parse generation history records.');
      }
    } catch (err: unknown) {
      setErrorMessage(formatHistoryErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [permissions.canAccessHistory, filters, userRole]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // 6. Delete Action Handler
  const handleDeleteConfirm = async (recordId: string) => {
    if (isDeleting) return;

    setIsDeleting(true);
    setDeleteErrorMessage(null);

    try {
      const res = await deleteAIHistoryItem(recordId);
      if (res && res.success) {
        // Close modals
        setRecordToDelete(null);
        if (detailRecordId === recordId) {
          setDetailRecordId(null);
        }

        // Optimistically remove from list
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
        }));

        setSuccessBanner('Generation history record deleted successfully.');
        setTimeout(() => setSuccessBanner(null), 3000);

        // Refresh to reconcile pagination
        fetchHistory();
      } else {
        setDeleteErrorMessage('Failed to delete history record.');
      }
    } catch (err: unknown) {
      setDeleteErrorMessage(formatHistoryDeleteError(err));
    } finally {
      setIsDeleting(false);
    }
  };

  // 7. Filter Change Handlers (Always reset to page 1)
  const handleTypeChange = (type: AIGenerationType | 'ALL') => {
    setFilters((prev) => ({
      ...prev,
      generationType: type,
      page: 1,
    }));
  };

  const handleAllUsersToggle = () => {
    setFilters((prev) => ({
      ...prev,
      allUsers: !prev.allUsers,
      targetUserId: !prev.allUsers ? '' : prev.targetUserId, // Clear target user if viewing all
      page: 1,
    }));
  };

  const handleTargetUserIdChange = (val: string) => {
    setFilters((prev) => ({
      ...prev,
      targetUserId: val,
      allUsers: false, // Target user overrides allUsers
      page: 1,
    }));
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_HISTORY_FILTER_STATE);
  };

  // 8. If user is ANALYST, render restricted access state
  if (!permissions.canAccessHistory) {
    return (
      <div className={cn('p-8 rounded-2xl border border-devpilot-border bg-devpilot-card text-center space-y-3', className)}>
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-devpilot-text">Access Restricted</h4>
        <p className="text-xs text-devpilot-muted max-w-md mx-auto">
          The Analyst role does not have authorization to view AI generation history. Please contact your workspace administrator if you require access.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Notifications */}
      {successBanner && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchHistory}
            className="h-6 text-xs text-rose-300 hover:text-white"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Filter & Control Bar */}
      <div className="p-4 rounded-xl border border-devpilot-border bg-devpilot-card space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Generation Type Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {(['ALL', 'IDEAS', 'CAPTION', 'HOOKS', 'HASHTAGS', 'CTA', 'REWRITE'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 select-none border',
                  filters.generationType === type
                    ? 'bg-devpilot-purple/15 border-devpilot-purple/50 text-devpilot-text'
                    : 'bg-devpilot-surface/60 border-devpilot-border hover:bg-devpilot-surface text-devpilot-muted'
                )}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Action Buttons: Reset & Refresh */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs text-devpilot-muted hover:text-devpilot-text h-7"
              title="Reset all filters"
            >
              <Filter className="w-3 h-3 mr-1" />
              <span>Reset</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchHistory}
              disabled={isLoading}
              className="text-xs h-7 gap-1"
            >
              <RotateCcw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Admin Explicit Scope Controls (OWNER & ADMIN only) */}
        {permissions.canViewOtherUsers && (
          <div className="pt-2.5 border-t border-devpilot-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filters.allUsers}
                  onChange={handleAllUsersToggle}
                  className="rounded border-devpilot-border bg-devpilot-bg text-devpilot-purple focus:ring-0"
                />
                <span className="text-devpilot-text font-medium flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-devpilot-cyan" />
                  Show All Users' Generations (Admin Scope)
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-devpilot-subtle text-[11px]">Filter by User ID:</span>
              <div className="relative">
                <Input
                  value={filters.targetUserId}
                  onChange={(e) => handleTargetUserIdChange(e.target.value)}
                  placeholder="Paste UUID..."
                  className="h-7 text-[11px] font-mono w-48 bg-devpilot-bg"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* History Records Table */}
      <div className="rounded-xl border border-devpilot-border bg-devpilot-card overflow-hidden">
        {isLoading && records.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center animate-pulse">
            <Sparkles className="w-8 h-8 text-devpilot-purple animate-spin mb-3" />
            <p className="text-xs text-devpilot-muted">Fetching generation history records...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Clock className="w-8 h-8 text-devpilot-muted mx-auto" />
            <h5 className="text-sm font-semibold text-devpilot-text">No Generation History Found</h5>
            <p className="text-xs text-devpilot-muted max-w-sm mx-auto">
              {filters.generationType !== 'ALL' || filters.allUsers || filters.targetUserId
                ? 'No records match the current filter criteria.'
                : 'Run generations in the Studio above to see your past generations recorded here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-devpilot-surface border-b border-devpilot-border text-devpilot-subtle uppercase text-[10px] font-semibold">
                <tr>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Summary</th>
                  <th className="py-3 px-4">Model & Duration</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Draft Link</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-devpilot-border/70">
                {records.map((record) => {
                  const summaryText = extractRecordSummary(record);
                  const isOwnRecord = currentUserId ? record.userId === currentUserId : true;

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-devpilot-surface/50 transition-colors"
                    >
                      {/* Type Badge */}
                      <td className="py-3 px-4 align-top">
                        <Badge variant="purple" className="text-[10px] font-mono">
                          {record.generationType}
                        </Badge>
                      </td>

                      {/* Summary */}
                      <td className="py-3 px-4 max-w-xs align-top">
                        <p className="text-xs text-devpilot-text line-clamp-2 leading-relaxed">
                          {summaryText}
                        </p>
                        <span className="text-[10px] text-devpilot-subtle font-mono mt-0.5 block">
                          ID: {record.id.slice(0, 8)}...
                        </span>
                      </td>

                      {/* Model & Latency */}
                      <td className="py-3 px-4 align-top text-devpilot-muted font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Cpu className="w-3 h-3 text-devpilot-cyan" />
                          <span>{record.model}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-devpilot-subtle">
                          <Clock className="w-3 h-3" />
                          <span>{(record.durationMs / 1000).toFixed(2)}s</span>
                        </div>
                      </td>

                      {/* Created At */}
                      <td className="py-3 px-4 align-top text-devpilot-muted whitespace-nowrap text-[11px]">
                        {new Date(record.createdAt).toLocaleDateString()}
                        <span className="text-[10px] text-devpilot-subtle block">
                          {new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      {/* Draft Linkage */}
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        {record.resultingPostId ? (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px] gap-1 font-mono">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Draft Linked</span>
                          </Badge>
                        ) : (
                          <span className="text-devpilot-subtle text-[11px]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailRecordId(record.id)}
                            className="h-7 w-7 p-0 text-devpilot-muted hover:text-devpilot-text"
                            title="View details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRecordToDelete(record)}
                            disabled={!isOwnRecord && !permissions.canDeleteOtherUsers}
                            className="h-7 w-7 p-0 text-devpilot-muted hover:text-rose-400"
                            title={isOwnRecord ? 'Delete history record' : 'Delete user record (Admin Scope)'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {records.length > 0 && (
          <div className="p-3.5 border-t border-devpilot-border flex items-center justify-between text-xs text-devpilot-muted">
            <span>
              Showing <span className="font-semibold text-devpilot-text">{records.length}</span> of{' '}
              <span className="font-semibold text-devpilot-text">{pagination.total}</span> records
            </span>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pagination.page <= 1 || isLoading}
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                className="h-7 px-2 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                Previous
              </Button>

              <span className="text-xs font-mono">
                Page {pagination.page} / {pagination.totalPages}
              </span>

              <Button
                size="sm"
                variant="outline"
                disabled={pagination.page >= pagination.totalPages || isLoading}
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                className="h-7 px-2 text-xs"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Record Detail Modal */}
      <AIHistoryDetailModal
        isOpen={Boolean(detailRecordId)}
        onClose={() => setDetailRecordId(null)}
        recordId={detailRecordId}
        initialSummary={records.find((r) => r.id === detailRecordId) || null}
      />

      {/* Record Delete Confirmation Dialog */}
      <AIHistoryDeleteDialog
        isOpen={Boolean(recordToDelete)}
        onClose={() => setRecordToDelete(null)}
        record={recordToDelete}
        currentUserId={currentUserId}
        isDeleting={isDeleting}
        onConfirmDelete={handleDeleteConfirm}
        errorMessage={deleteErrorMessage}
      />
    </div>
  );
}

/**
 * Extracts a concise human-readable summary string from the output payload.
 */
function extractRecordSummary(record: AIHistoryItem): string {
  const out = record.outputPayload as any;
  if (!out) return 'No preview available';

  switch (record.generationType) {
    case 'IDEAS':
      return Array.isArray(out.ideas) && out.ideas[0]?.title
        ? `1. ${out.ideas[0].title}`
        : 'Generated content ideas';
    case 'CAPTION':
      return out.title ? `${out.title}: ${out.caption?.slice(0, 80)}...` : out.caption?.slice(0, 100) || 'Social caption';
    case 'HOOKS':
      return Array.isArray(out.hooks) && out.hooks[0] ? `Hook 1: "${out.hooks[0]}"` : 'Opening hooks';
    case 'HASHTAGS':
      return Array.isArray(out.hashtags) ? out.hashtags.slice(0, 5).join(' ') : 'Hashtags set';
    case 'CTA':
      return Array.isArray(out.ctas) && out.ctas[0] ? `CTA 1: ${out.ctas[0]}` : 'Calls to action';
    case 'REWRITE':
      return out.rewrittenText ? out.rewrittenText.slice(0, 100) : 'Rewritten content';
    default:
      return 'AI generation output';
  }
}
