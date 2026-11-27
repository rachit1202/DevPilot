'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Trash2,
  X,
} from 'lucide-react';
import { AIHistoryItem } from '@/lib/ai-api';

export interface AIHistoryDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  record: AIHistoryItem | null;
  currentUserId?: string | null;
  isDeleting: boolean;
  onConfirmDelete: (recordId: string) => Promise<void>;
  errorMessage: string | null;
}

export function AIHistoryDeleteDialog({
  isOpen,
  onClose,
  record,
  currentUserId,
  isDeleting,
  onConfirmDelete,
  errorMessage,
}: AIHistoryDeleteDialogProps) {
  if (!isOpen || !record) return null;

  const isCrossUser = currentUserId ? record.userId !== currentUserId : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors disabled:opacity-50"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-devpilot-text">
              Delete Generation Record
            </h3>
            <p className="text-xs text-devpilot-muted">
              Confirm permanent deletion of this AI history record.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-devpilot-surface border border-devpilot-border/80 space-y-2 mb-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-devpilot-subtle uppercase text-[10px] font-semibold">
              Type
            </span>
            <Badge variant="purple" className="text-[10px]">
              {record.generationType}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-devpilot-subtle uppercase text-[10px] font-semibold">
              Record ID
            </span>
            <span className="font-mono text-devpilot-text text-[11px]">
              {record.id.slice(0, 13)}...
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-devpilot-subtle uppercase text-[10px] font-semibold">
              Owner
            </span>
            <span className="font-mono text-devpilot-text text-[11px]">
              {isCrossUser ? (
                <span className="text-amber-400 font-semibold">Other User ({record.userId.slice(0, 8)}...)</span>
              ) : (
                <span className="text-emerald-400 font-semibold">Your Record</span>
              )}
            </span>
          </div>

          {record.resultingPostId && (
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
              Note: This record is linked to a Draft ContentPost. Deleting history will unlink the reference, but the Draft post will be preserved in your Content Library.
            </div>
          )}

          {isCrossUser && (
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] leading-relaxed">
              Admin Scope Notice: Deleting another user's generation record will be permanently recorded in the system audit log.
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 mb-4">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isDeleting}
            disabled={isDeleting}
            onClick={() => onConfirmDelete(record.id)}
            className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
