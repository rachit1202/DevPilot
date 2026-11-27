'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Clock,
  Cpu,
  User,
  Calendar,
  FolderKanban,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Sparkles,
  FileText,
} from 'lucide-react';
import { AIHistoryItem, getAIHistoryItem } from '@/lib/ai-api';
import { copyTextToClipboard } from './ai-studio-logic';
import { formatHistoryErrorMessage } from './ai-history-logic';

export interface AIHistoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string | null;
  initialSummary?: AIHistoryItem | null;
}

export function AIHistoryDetailModal({
  isOpen,
  onClose,
  recordId,
  initialSummary,
}: AIHistoryDetailModalProps) {
  const [record, setRecord] = useState<AIHistoryItem | null>(initialSummary || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedPayload, setCopiedPayload] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !recordId) {
      setRecord(null);
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    // Fetch full detail from GET /api/v1/ai/history/:id
    getAIHistoryItem(recordId)
      .then((res) => {
        if (isMounted) {
          if (res && res.success && res.data) {
            setRecord(res.data);
          } else {
            setErrorMessage('Unable to load history record details.');
          }
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setErrorMessage(formatHistoryErrorMessage(err));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, recordId]);

  const handleCopy = async (key: string, text: string) => {
    const success = await copyTextToClipboard(text);
    if (success) {
      setCopiedPayload(key);
      setTimeout(() => setCopiedPayload(null), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-3xl rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
          title="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5 pb-3 border-b border-devpilot-border">
          <div className="w-9 h-9 rounded-xl bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-center justify-center text-devpilot-purple shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-devpilot-text">
                Generation History Record
              </h3>
              {record && (
                <Badge variant="purple" className="text-[10px] font-mono">
                  {record.generationType}
                </Badge>
              )}
            </div>
            <p className="text-xs text-devpilot-muted mt-0.5 font-mono">
              ID: {recordId}
            </p>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center text-center animate-pulse">
            <Sparkles className="w-8 h-8 text-devpilot-purple animate-spin mb-3" />
            <p className="text-xs text-devpilot-muted">Loading record details from backend...</p>
          </div>
        )}

        {/* Error State */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3 text-xs text-rose-300">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Record Inaccessible</span>
              <p className="text-rose-300/90 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Record Content */}
        {!isLoading && record && (
          <div className="space-y-5">
            {/* Metadata Overview Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-devpilot-surface border border-devpilot-border/80 text-xs">
              <div>
                <span className="text-[10px] text-devpilot-subtle uppercase font-semibold flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-devpilot-cyan" /> Model
                </span>
                <p className="font-mono text-devpilot-text mt-0.5">{record.model}</p>
              </div>

              <div>
                <span className="text-[10px] text-devpilot-subtle uppercase font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" /> Duration
                </span>
                <p className="font-mono text-devpilot-text mt-0.5">{(record.durationMs / 1000).toFixed(2)}s</p>
              </div>

              <div>
                <span className="text-[10px] text-devpilot-subtle uppercase font-semibold flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-indigo-400" /> Created At
                </span>
                <p className="text-devpilot-text mt-0.5 text-[11px]">
                  {new Date(record.createdAt).toLocaleString()}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-devpilot-subtle uppercase font-semibold flex items-center gap-1">
                  <User className="w-3 h-3 text-emerald-400" /> Owner ID
                </span>
                <p className="font-mono text-devpilot-text mt-0.5 text-[11px] truncate" title={record.userId}>
                  {record.userId.slice(0, 8)}...
                </p>
              </div>
            </div>

            {/* Linked ContentPost Status */}
            {record.resultingPostId && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-200">
                    Linked to ContentPost Draft:{' '}
                    <span className="font-mono font-bold text-emerald-300">
                      {record.resultingPostId.slice(0, 8)}...
                    </span>
                  </span>
                </div>
                <Link href="/content" onClick={onClose}>
                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-emerald-500/40 text-emerald-400">
                    <span>View in Library</span>
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            )}

            {/* Persisted Input Payload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-devpilot-text uppercase tracking-wider text-[11px]">
                  Input Parameters
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy('input', JSON.stringify(record.inputPayload, null, 2))}
                  className="h-6 text-xs px-2 gap-1 text-devpilot-subtle hover:text-devpilot-text"
                >
                  {copiedPayload === 'input' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPayload === 'input' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
              <pre className="p-3 rounded-xl bg-devpilot-bg border border-devpilot-border text-[11px] font-mono text-devpilot-text overflow-x-auto max-h-40">
                {JSON.stringify(record.inputPayload, null, 2)}
              </pre>
            </div>

            {/* Persisted Output Payload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-devpilot-text uppercase tracking-wider text-[11px]">
                  Generated Output (Persisted)
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy('output', JSON.stringify(record.outputPayload, null, 2))}
                  className="h-6 text-xs px-2 gap-1 text-devpilot-subtle hover:text-devpilot-text"
                >
                  {copiedPayload === 'output' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPayload === 'output' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
              <pre className="p-3 rounded-xl bg-devpilot-bg border border-devpilot-border text-[11px] font-mono text-devpilot-text overflow-x-auto max-h-60 whitespace-pre-wrap">
                {JSON.stringify(record.outputPayload, null, 2)}
              </pre>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end pt-4 mt-5 border-t border-devpilot-border/80">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
