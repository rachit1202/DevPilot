'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  saveToDraft,
  SaveToDraftData,
  CreatedDraftPost,
} from '@/lib/ai-api';
import {
  canUserPromoteToDraft,
  validateSaveToDraftForm,
  formatSaveToDraftError,
  SaveToDraftFormState,
  INITIAL_SAVE_TO_DRAFT_FORM_STATE,
} from './save-to-draft-logic';
import {
  STUDIO_TOOLS,
  StudioToolId,
  copyTextToClipboard,
} from './ai-studio-logic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  X,
  FilePlus,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  FolderKanban,
  Sparkles,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserRole } from '@devpilot/shared';

export interface SaveToDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolId: StudioToolId;
  historyId: string;
  outputData: any;
  userRole?: UserRole | string | null;
  initialItemIndex?: number | null;
  onSuccess?: (createdDraft: CreatedDraftPost) => void;
}

export function SaveToDraftModal({
  isOpen,
  onClose,
  toolId,
  historyId,
  outputData,
  userRole,
  initialItemIndex = null,
  onSuccess,
}: SaveToDraftModalProps) {
  // 1. Form and UI State (isolated per historyId / tool)
  const [formState, setFormState] = useState<SaveToDraftFormState>(
    INITIAL_SAVE_TO_DRAFT_FORM_STATE
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SaveToDraftData | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // 2. Initialize / Reset state whenever modal opens or historyId changes
  useEffect(() => {
    if (isOpen) {
      setFormState({
        selectedIdeaIndex: toolId === 'ideas' && initialItemIndex !== null ? initialItemIndex : null,
        selectedHookIndex: toolId === 'hooks' && initialItemIndex !== null ? initialItemIndex : null,
        title: '',
        caption: '',
      });
      setIsSubmitting(false);
      setErrorMessage(null);
      setSuccessData(null);
    }
  }, [isOpen, historyId, toolId, initialItemIndex]);

  // 3. Permission and Validation Evaluation
  const isAuthorizedRole = useMemo(() => canUserPromoteToDraft(userRole), [userRole]);
  const toolConfig = STUDIO_TOOLS[toolId];

  const validation = useMemo(
    () => validateSaveToDraftForm(toolId, formState, outputData),
    [toolId, formState, outputData]
  );

  const canSubmit = isAuthorizedRole && validation.isValid && !isSubmitting && !successData;

  // 4. Submission Handler
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit || !validation.payload) return;

    // Concurrency guard: synchronously lock state
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await saveToDraft(historyId, validation.payload);
      if (res && res.success && res.data) {
        setSuccessData(res.data);
        onSuccess?.(res.data.post);
      } else {
        setErrorMessage('Unexpected response from draft creation service.');
      }
    } catch (err: unknown) {
      const msg = formatSaveToDraftError(err);
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for copying unsupported types
  const handleCopyUnsupportedContent = async (text: string) => {
    const success = await copyTextToClipboard(text);
    if (success) {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors disabled:opacity-50"
          title="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5 pb-3 border-b border-devpilot-border">
          <div className="w-9 h-9 rounded-xl bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-center justify-center text-devpilot-purple shrink-0">
            <FilePlus className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-devpilot-text">
                Save to Content Library
              </h3>
              <Badge variant="purple" className="text-[10px] uppercase font-bold tracking-wider">
                Draft
              </Badge>
            </div>
            <p className="text-xs text-devpilot-muted mt-0.5">
              Promote AI generation into a new ContentPost draft record ({toolConfig.name}).
            </p>
          </div>
        </div>

        {/* SUCCESS VIEW */}
        {successData ? (
          <div className="space-y-5 py-2">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-emerald-200">
                  Draft Created Successfully!
                </h4>
                <p className="text-xs text-emerald-300/80 mt-0.5">
                  Your AI generation has been promoted to a ContentPost in DRAFT status.
                </p>
              </div>
            </div>

            {/* Created Draft Post Details */}
            <div className="p-4 rounded-xl bg-devpilot-surface border border-devpilot-border/80 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-devpilot-border/60">
                <span className="font-semibold text-devpilot-subtle uppercase tracking-wider text-[10px]">
                  Created ContentPost
                </span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  ID: {successData.post.id.slice(0, 8)}...
                </Badge>
              </div>

              <div>
                <span className="text-[11px] text-devpilot-subtle uppercase font-semibold">
                  Title
                </span>
                <p className="text-sm font-semibold text-devpilot-text mt-0.5">
                  {successData.post.title}
                </p>
              </div>

              {successData.post.caption && (
                <div>
                  <span className="text-[11px] text-devpilot-subtle uppercase font-semibold">
                    Caption Preview
                  </span>
                  <p className="text-xs text-devpilot-muted mt-0.5 whitespace-pre-line line-clamp-3">
                    {successData.post.caption}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-devpilot-subtle">
                <span className="flex items-center gap-1">
                  Status: <Badge variant="warning" className="text-[10px]">{successData.post.status}</Badge>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  Type: {successData.post.contentType}
                </span>
                <span>•</span>
                <span className="text-[11px]">
                  Source: {successData.post.sourceType}
                </span>
              </div>
            </div>

            {/* Success Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                size="md"
                onClick={onClose}
                className="text-xs"
              >
                Done
              </Button>

              <Link href="/content" onClick={onClose}>
                <Button
                  variant="primary"
                  size="md"
                  className="gap-1.5 text-xs"
                >
                  <FolderKanban className="w-4 h-4" />
                  <span>View in Content Library</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* FORM / CONFIGURATION VIEW */
          <form onSubmit={handleSave} className="space-y-4">
            {/* Role Permission Banner */}
            {!isAuthorizedRole && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Unauthorized Role</span>
                  <span>
                    Your current role ({userRole || 'ANALYST'}) cannot create drafts. Only Owner, Admin, and Editor roles can promote AI generations to drafts.
                  </span>
                </div>
              </div>
            )}

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-start gap-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block">Save Failed</span>
                  <span className="text-rose-300/90">{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Tool Specific Views */}

            {/* 0. REEL SCRIPT: Summary & Optional Title Override */}
            {toolId === 'reel-script' && outputData && (
              <div className="space-y-3.5">
                {/* Script Summary Card */}
                <div className="p-3.5 rounded-lg bg-devpilot-surface border border-devpilot-border/70 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold text-devpilot-cyan uppercase tracking-wider">
                      Reel Script Summary
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="purple" className="text-[10px] font-mono">
                        {outputData.duration}s Target
                      </Badge>
                      <Badge variant="default" className="text-[10px] font-mono">
                        {outputData.scenes?.length || 0} Scenes
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-devpilot-subtle">Topic: </span>
                    <span className="text-xs text-devpilot-text font-medium">{outputData.topic}</span>
                  </div>

                  {outputData.hook && (
                    <div className="pt-1.5 border-t border-devpilot-border/40">
                      <span className="text-[10px] text-purple-300 uppercase font-semibold block">Opening Hook</span>
                      <p className="text-xs text-purple-200 mt-0.5 line-clamp-2 italic">
                        "{outputData.hook}"
                      </p>
                    </div>
                  )}
                </div>

                {/* Optional Custom Title Override */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Draft Title <span className="text-devpilot-subtle font-normal">(Optional Override)</span>
                    </label>
                    <span className={cn(
                      'text-[11px] font-mono',
                      formState.title.trim().length > 0 && (formState.title.trim().length < 3 || formState.title.trim().length > 200)
                        ? 'text-amber-400'
                        : 'text-devpilot-subtle'
                    )}>
                      {formState.title.length > 0 ? `${formState.title.length}/200 (min 3)` : `Default: ${outputData.title}`}
                    </span>
                  </div>
                  <Input
                    value={formState.title}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    placeholder={`Default: ${outputData.title}`}
                    className="h-9 text-xs"
                    disabled={isSubmitting}
                  />
                  <p className="text-[11px] text-devpilot-subtle">
                    Leave blank to use the generated Reel Script title.
                  </p>
                </div>
              </div>
            )}

            {/* 1. CAPTION: Preview Only */}
            {toolId === 'caption' && outputData && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-devpilot-surface border border-devpilot-border/70 space-y-2">
                  <div>
                    <span className="text-[10px] font-semibold text-devpilot-cyan uppercase tracking-wider">
                      Draft Title (Generated)
                    </span>
                    <p className="text-sm font-semibold text-devpilot-text mt-0.5">
                      {outputData.title}
                    </p>
                  </div>

                  {outputData.hook && (
                    <div>
                      <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider">
                        Opening Hook
                      </span>
                      <p className="text-xs text-purple-200 mt-0.5 font-medium">
                        {outputData.hook}
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] font-semibold text-devpilot-subtle uppercase tracking-wider">
                      Body Caption
                    </span>
                    <p className="text-xs text-devpilot-text mt-0.5 whitespace-pre-line line-clamp-4">
                      {outputData.caption}
                    </p>
                  </div>

                  {outputData.cta && (
                    <div>
                      <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">
                        Call to Action
                      </span>
                      <p className="text-xs text-emerald-200 mt-0.5">
                        {outputData.cta}
                      </p>
                    </div>
                  )}

                  {outputData.hashtags && outputData.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {outputData.hashtags.map((tag: string, i: number) => (
                        <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-devpilot-cyan/10 text-devpilot-cyan">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-xs text-devpilot-muted">
                  The title, hook, caption, CTA, and hashtags will be combined into a structured draft post.
                </p>
              </div>
            )}

            {/* 2. IDEAS: Select 1 Idea */}
            {toolId === 'ideas' && outputData?.ideas && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-devpilot-text">
                    Select Idea to Promote *
                  </label>
                  <span className="text-devpilot-subtle text-[11px]">
                    Choose 1 of 3 concepts
                  </span>
                </div>

                <div className="space-y-2">
                  {outputData.ideas.map((idea: any, index: number) => {
                    const isSelected = formState.selectedIdeaIndex === index;
                    return (
                      <div
                        key={index}
                        onClick={() =>
                          !isSubmitting &&
                          setFormState((prev) => ({
                            ...prev,
                            selectedIdeaIndex: index,
                          }))
                        }
                        className={cn(
                          'p-3.5 rounded-xl border transition-all cursor-pointer select-none space-y-1.5',
                          isSelected
                            ? 'bg-devpilot-purple/15 border-devpilot-purple text-devpilot-text shadow-sm'
                            : 'bg-devpilot-surface/60 border-devpilot-border hover:bg-devpilot-surface hover:border-devpilot-borderHover'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold',
                              isSelected
                                ? 'border-devpilot-purple bg-devpilot-purple text-white'
                                : 'border-devpilot-border text-devpilot-subtle'
                            )}>
                              {index + 1}
                            </span>
                            <span className="text-xs font-semibold text-devpilot-text">
                              {idea.title}
                            </span>
                          </div>
                          <Badge variant="cyan" className="text-[10px] font-mono">
                            {idea.suggestedFormat}
                          </Badge>
                        </div>
                        <p className="text-xs text-devpilot-muted leading-relaxed pl-6">
                          {idea.concept}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {formState.selectedIdeaIndex === null && (
                  <p className="text-xs text-amber-400/90 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Please select an idea above to enable Save to Draft.</span>
                  </p>
                )}
              </div>
            )}

            {/* 3. REWRITE: Title Input + Rewritten Preview */}
            {toolId === 'rewrite' && outputData && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Post Title *
                    </label>
                    <span className={cn(
                      'text-[11px] font-mono',
                      formState.title.length < 3 || formState.title.length > 200
                        ? 'text-amber-400'
                        : 'text-devpilot-subtle'
                    )}>
                      {formState.title.length}/200 (min 3)
                    </span>
                  </div>
                  <Input
                    value={formState.title}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    placeholder="e.g. Polished Guide: Clean Architecture in React"
                    className="h-9 text-xs"
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-semibold text-devpilot-subtle">
                    Rewritten Caption Preview
                  </span>
                  <div className="p-3 rounded-lg bg-devpilot-surface border border-devpilot-border/70 max-h-40 overflow-y-auto">
                    <p className="text-xs text-devpilot-text whitespace-pre-line leading-relaxed">
                      {outputData.rewrittenText}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. HOOKS: Select 1 Hook + Title + Caption */}
            {toolId === 'hooks' && outputData?.hooks && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Select Opening Hook *
                  </label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {outputData.hooks.map((hook: string, index: number) => {
                      const isSelected = formState.selectedHookIndex === index;
                      return (
                        <div
                          key={index}
                          onClick={() =>
                            !isSubmitting &&
                            setFormState((prev) => ({
                              ...prev,
                              selectedHookIndex: index,
                            }))
                          }
                          className={cn(
                            'p-2.5 rounded-lg border text-xs cursor-pointer select-none flex items-start gap-2.5 transition-all',
                            isSelected
                              ? 'bg-purple-500/15 border-purple-500 text-purple-200 shadow-sm'
                              : 'bg-devpilot-surface/60 border-devpilot-border hover:bg-devpilot-surface text-devpilot-text'
                          )}
                        >
                          <span className={cn(
                            'w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
                            isSelected
                              ? 'border-purple-400 bg-purple-500 text-white'
                              : 'border-devpilot-border text-devpilot-subtle'
                          )}>
                            {index + 1}
                          </span>
                          <span className="leading-snug">{hook}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Post Title *
                    </label>
                    <span className={cn(
                      'text-[11px] font-mono',
                      formState.title.length < 3 || formState.title.length > 200
                        ? 'text-amber-400'
                        : 'text-devpilot-subtle'
                    )}>
                      {formState.title.length}/200
                    </span>
                  </div>
                  <Input
                    value={formState.title}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    placeholder="e.g. 5 Coding Mistakes to Avoid"
                    className="h-9 text-xs"
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Post Body / Caption *
                    </label>
                    <span className={cn(
                      'text-[11px] font-mono',
                      formState.caption.length < 5
                        ? 'text-amber-400'
                        : 'text-devpilot-subtle'
                    )}>
                      {formState.caption.length}/10,000 (min 5)
                    </span>
                  </div>
                  <textarea
                    value={formState.caption}
                    onChange={(e) =>
                      setFormsStateText(e.target.value)
                    }
                    placeholder="Write post body... (Selected hook will be prepended as opening line)"
                    rows={3}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y"
                    disabled={isSubmitting}
                    required
                  />
                </div>
              </div>
            )}

            {/* 5. CTA / HASHTAGS: Unsupported Warning */}
            {(!validation.isSupported || toolId === 'cta' || toolId === 'hashtags') && (
              <div className="p-4 rounded-xl bg-devpilot-surface border border-devpilot-border space-y-3">
                <div className="flex items-start gap-2.5 text-xs text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">
                      Direct Save-to-Draft Unsupported
                    </span>
                    <p className="text-devpilot-muted mt-0.5 leading-relaxed">
                      {validation.errorMessage}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-devpilot-border/60">
                  <span className="text-xs text-devpilot-subtle">
                    Copy content to clipboard instead:
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const text = toolId === 'hashtags'
                        ? (outputData?.hashtags || []).join(' ')
                        : (outputData?.ctas || []).join('\n\n');
                      handleCopyUnsupportedContent(text);
                    }}
                    className="text-xs gap-1.5"
                  >
                    {copiedNotification ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Content</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-devpilot-border/80">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={onClose}
                disabled={isSubmitting}
                className="text-xs text-devpilot-muted hover:text-devpilot-text"
              >
                Cancel
              </Button>

              {validation.isSupported && (
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSubmitting}
                  disabled={!canSubmit}
                  className="gap-2 text-xs"
                >
                  <FilePlus className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving Draft...' : 'Confirm & Save Draft'}</span>
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );

  function setFormsStateText(text: string) {
    setFormState((prev) => ({
      ...prev,
      caption: text,
    }));
  }
}
