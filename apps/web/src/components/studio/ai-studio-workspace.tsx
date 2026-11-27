'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  generateIdeas,
  generateCaption,
  generateHooks,
  generateHashtags,
  generateCta,
  generateRewrite,
  generateCarousel,
  generateReelScript,
  AIStatusData,
  AIGenerationMeta,
} from '@/lib/ai-api';
import {
  STUDIO_TOOLS,
  StudioToolId,
  StudioFormsState,
  INITIAL_FORMS_STATE,
  checkEngineReadiness,
  validateIdeasInput,
  validateCaptionInput,
  validateHooksInput,
  validateHashtagsInput,
  validateCtaInput,
  validateRewriteInput,
  validateCarouselInput,
  validateReelScriptInput,
  formatAIErrorMessage,
} from './ai-studio-logic';
import { AIOutputContainer } from './ai-output-cards';
import { SaveToDraftModal } from './save-to-draft-modal';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Lightbulb,
  FileText,
  Anchor,
  Hash,
  Megaphone,
  Repeat,
  Sparkles,
  AlertCircle,
  RotateCcw,
  Info,
  Layers,
  Film,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AIStudioWorkspaceProps {
  engineStatus: AIStatusData | null;
  isStatusLoading?: boolean;
  onGenerationSettled?: () => void;
  className?: string;
}

interface ToolOutputEntry {
  data: any;
  meta: AIGenerationMeta;
}

export function AIStudioWorkspace({
  engineStatus,
  isStatusLoading = false,
  onGenerationSettled,
  className,
}: AIStudioWorkspaceProps) {
  // 1. Tool Selection & In-Memory State
  const [activeTool, setActiveTool] = useState<StudioToolId>('ideas');
  const [formsState, setFormsState] = useState<StudioFormsState>(INITIAL_FORMS_STATE);
  const [outputsState, setOutputsState] = useState<Record<StudioToolId, ToolOutputEntry | null>>({
    'reel-script': null,
    carousel: null,
    ideas: null,
    caption: null,
    hooks: null,
    hashtags: null,
    cta: null,
    rewrite: null,
  });

  // 2. Generation & Error State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // 3. Save-to-Draft Modal & Tracking State
  const { user } = useAuth();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [saveModalInitialIndex, setSaveModalInitialIndex] = useState<number | undefined>(undefined);
  const [savedHistoryIds, setSavedHistoryIds] = useState<Set<string>>(new Set());

  // 4. Engine Readiness Evaluation
  const readiness = useMemo(
    () => checkEngineReadiness(engineStatus, isStatusLoading, isGenerating),
    [engineStatus, isStatusLoading, isGenerating]
  );

  // 4. Current Tool Config & Validation
  const currentConfig = STUDIO_TOOLS[activeTool];

  const validation = useMemo(() => {
    switch (activeTool) {
      case 'reel-script':
        return validateReelScriptInput(formsState['reel-script']);
      case 'carousel':
        return validateCarouselInput(formsState.carousel);
      case 'ideas':
        return validateIdeasInput(formsState.ideas);
      case 'caption':
        return validateCaptionInput(formsState.caption);
      case 'hooks':
        return validateHooksInput(formsState.hooks);
      case 'hashtags':
        return validateHashtagsInput(formsState.hashtags);
      case 'cta':
        return validateCtaInput(formsState.cta);
      case 'rewrite':
        return validateRewriteInput(formsState.rewrite);
    }
  }, [activeTool, formsState]);

  // Current primary text character count
  const currentTextLength = useMemo(() => {
    switch (activeTool) {
      case 'reel-script':
        return formsState['reel-script'].topic.length;
      case 'carousel':
        return formsState.carousel.topic.length;
      case 'ideas':
        return formsState.ideas.topic.length;
      case 'caption':
        return formsState.caption.topic.length;
      case 'hooks':
        return formsState.hooks.topic.length;
      case 'hashtags':
        return formsState.hashtags.content.length;
      case 'cta':
        return formsState.cta.goal.length;
      case 'rewrite':
        return formsState.rewrite.text.length;
    }
  }, [activeTool, formsState]);

  // Can the user submit generation?
  const canSubmit = readiness.canGenerate && validation.isValid && !isGenerating;

  // 5. Submit Handler
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !validation.payload) return;

    // Concurrency guard: immediate local lock
    setIsGenerating(true);
    setGenerationError(null);

    try {
      let res: any = null;

      switch (activeTool) {
        case 'reel-script':
          res = await generateReelScript(validation.payload as any);
          break;
        case 'carousel':
          res = await generateCarousel(validation.payload as any);
          break;
        case 'ideas':
          res = await generateIdeas(validation.payload as any);
          break;
        case 'caption':
          res = await generateCaption(validation.payload as any);
          break;
        case 'hooks':
          res = await generateHooks(validation.payload as any);
          break;
        case 'hashtags':
          res = await generateHashtags(validation.payload as any);
          break;
        case 'cta':
          res = await generateCta(validation.payload as any);
          break;
        case 'rewrite':
          res = await generateRewrite(validation.payload as any);
          break;
      }

      if (res && res.success && res.data) {
        setOutputsState((prev) => ({
          ...prev,
          [activeTool]: {
            data: res.data,
            meta: res.meta,
          },
        }));
      } else {
        setGenerationError('Failed to parse generation response from backend.');
      }
    } catch (err: unknown) {
      const msg = formatAIErrorMessage(err);
      setGenerationError(msg);
    } finally {
      setIsGenerating(false);
      // Trigger status refresh on settle (both success and error)
      onGenerationSettled?.();
    }
  };

  // 6. Reset current tool input
  const handleClearCurrentInput = () => {
    setFormsState((prev) => ({
      ...prev,
      [activeTool]: INITIAL_FORMS_STATE[activeTool],
    }));
    setGenerationError(null);
  };

  // Helper icon lookup for tool switcher
  const renderToolIcon = (id: StudioToolId, isActive: boolean) => {
    const iconClass = cn('w-4 h-4', isActive ? 'text-devpilot-purple' : 'text-devpilot-muted');
    switch (id) {
      case 'reel-script':
        return <Film className={iconClass} />;
      case 'carousel':
        return <Layers className={iconClass} />;
      case 'ideas':
        return <Lightbulb className={iconClass} />;
      case 'caption':
        return <FileText className={iconClass} />;
      case 'hooks':
        return <Anchor className={iconClass} />;
      case 'hashtags':
        return <Hash className={iconClass} />;
      case 'cta':
        return <Megaphone className={iconClass} />;
      case 'rewrite':
        return <Repeat className={iconClass} />;
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Tool Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-devpilot-border/80">
        {(Object.keys(STUDIO_TOOLS) as StudioToolId[]).map((id) => {
          const tool = STUDIO_TOOLS[id];
          const isActive = activeTool === id;
          const hasOutput = Boolean(outputsState[id]);

          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTool(id);
                setGenerationError(null);
              }}
              className={cn(
                'flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all shrink-0 border select-none',
                isActive
                  ? 'bg-devpilot-purple/15 border-devpilot-purple/40 text-devpilot-text shadow-sm'
                  : 'bg-devpilot-card/70 border-devpilot-border hover:bg-devpilot-card hover:border-devpilot-borderHover text-devpilot-muted'
              )}
            >
              {renderToolIcon(id, isActive)}
              <span>{tool.name}</span>
              {hasOutput && (
                <span className="w-1.5 h-1.5 rounded-full bg-devpilot-cyan" title="Generated output ready" />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Studio Grid: Form (Left) & Output (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Input Configuration Form */}
        <div className="lg:col-span-5 space-y-4">
          <form
            onSubmit={handleGenerate}
            className="p-5 rounded-xl border border-devpilot-border bg-devpilot-card shadow-sm space-y-4"
          >
            {/* Header info for current tool */}
            <div className="pb-3 border-b border-devpilot-border/60">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-devpilot-text flex items-center gap-2">
                  {currentConfig.name}
                </h3>
                <Badge variant="cyan" className="text-[10px] uppercase font-bold tracking-wider">
                  {currentConfig.badge}
                </Badge>
              </div>
              <p className="text-xs text-devpilot-muted mt-1">
                {currentConfig.description}
              </p>
            </div>

            {/* Tool-specific form fields */}
            {activeTool === 'reel-script' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Topic or Video Concept *
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-mono',
                        currentTextLength > currentConfig.maxChars || (currentTextLength > 0 && currentTextLength < currentConfig.minChars)
                          ? 'text-rose-400 font-bold'
                          : 'text-devpilot-subtle'
                      )}
                    >
                      {currentTextLength}/{currentConfig.maxChars}
                    </span>
                  </div>
                  <textarea
                    value={formsState['reel-script'].topic}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        'reel-script': { ...prev['reel-script'], topic: e.target.value },
                      }))
                    }
                    placeholder={currentConfig.inputPlaceholder}
                    rows={3}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y font-sans"
                    disabled={isGenerating}
                  />
                  {currentTextLength > 0 && currentTextLength < currentConfig.minChars && (
                    <p className="text-[11px] text-rose-400">
                      Topic must be at least {currentConfig.minChars} characters.
                    </p>
                  )}
                </div>

                {/* Target Duration Selector (30s, 60s, 90s) */}
                <div className="space-y-2 p-3 rounded-lg bg-devpilot-surface/60 border border-devpilot-border/60">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text flex items-center gap-2">
                      <span>Target Video Duration</span>
                      <Badge variant="purple" className="text-[10px] font-mono px-1.5 py-0">
                        {formsState['reel-script'].duration}s
                      </Badge>
                    </label>
                    <span className="text-[11px] text-devpilot-subtle">Target timing & scenes</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([30, 60, 90] as const).map((dur) => {
                      const isSelected = formsState['reel-script'].duration === dur;
                      const label = dur === 30 ? '30s (Quick Tip)' : dur === 60 ? '60s (Standard)' : '90s (Deep Dive)';
                      return (
                        <button
                          key={dur}
                          type="button"
                          onClick={() =>
                            setFormsState((prev) => ({
                              ...prev,
                              'reel-script': { ...prev['reel-script'], duration: dur },
                            }))
                          }
                          disabled={isGenerating}
                          className={cn(
                            'py-2 px-2.5 rounded-lg text-xs font-medium border text-center transition-all select-none',
                            isSelected
                              ? 'bg-devpilot-purple/20 border-devpilot-purple text-devpilot-text font-bold shadow-sm'
                              : 'bg-devpilot-card/80 border-devpilot-border text-devpilot-muted hover:border-devpilot-borderHover hover:text-devpilot-text'
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Target Platform Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Target Platform
                  </label>
                  <select
                    value={formsState['reel-script'].platform}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        'reel-script': {
                          ...prev['reel-script'],
                          platform: e.target.value as any,
                        },
                      }))
                    }
                    className="w-full h-9 rounded-lg bg-devpilot-bg border border-devpilot-border px-3 text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple font-sans"
                    disabled={isGenerating}
                  >
                    <option value="INSTAGRAM_REELS">Instagram Reels (Default)</option>
                    <option value="YOUTUBE_SHORTS">YouTube Shorts</option>
                    <option value="TIKTOK">TikTok</option>
                    <option value="GENERAL">General Short-Form Video</option>
                  </select>
                </div>

                {/* Tone of Voice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Tone of Voice <span className="text-devpilot-subtle font-normal">(Optional, max 100)</span>
                  </label>
                  <Input
                    value={formsState['reel-script'].tone}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        'reel-script': { ...prev['reel-script'], tone: e.target.value },
                      }))
                    }
                    placeholder="e.g. Informative, energetic, developer-friendly..."
                    className="h-9 text-xs"
                    disabled={isGenerating}
                    maxLength={100}
                  />
                </div>

                {/* Target Audience & Language (2-column layout) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-devpilot-text">
                      Target Audience <span className="text-devpilot-subtle font-normal">(Optional, max 200)</span>
                    </label>
                    <Input
                      value={formsState['reel-script'].targetAudience}
                      onChange={(e) =>
                        setFormsState((prev) => ({
                          ...prev,
                          'reel-script': { ...prev['reel-script'], targetAudience: e.target.value },
                        }))
                      }
                      placeholder="e.g. Web developers, students..."
                      className="h-9 text-xs"
                      disabled={isGenerating}
                      maxLength={200}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-devpilot-text">
                      Language <span className="text-devpilot-subtle font-normal">(Default: en, max 50)</span>
                    </label>
                    <Input
                      value={formsState['reel-script'].language}
                      onChange={(e) =>
                        setFormsState((prev) => ({
                          ...prev,
                          'reel-script': { ...prev['reel-script'], language: e.target.value },
                        }))
                      }
                      placeholder="e.g. en, es, hi..."
                      className="h-9 text-xs"
                      disabled={isGenerating}
                      maxLength={50}
                    />
                  </div>
                </div>

                {/* Additional Instructions */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Additional Instructions <span className="text-devpilot-subtle font-normal">(Optional, max 500)</span>
                  </label>
                  <textarea
                    value={formsState['reel-script'].additionalInstructions}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        'reel-script': { ...prev['reel-script'], additionalInstructions: e.target.value },
                      }))
                    }
                    placeholder="e.g. Include a code debugging visual direction and focus on common mistakes..."
                    rows={2}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y font-sans"
                    disabled={isGenerating}
                    maxLength={500}
                  />
                </div>
              </>
            )}

            {activeTool === 'carousel' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Topic or Concept *
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-mono',
                        currentTextLength > currentConfig.maxChars || (currentTextLength > 0 && currentTextLength < currentConfig.minChars)
                          ? 'text-rose-400 font-bold'
                          : 'text-devpilot-subtle'
                      )}
                    >
                      {currentTextLength}/{currentConfig.maxChars}
                    </span>
                  </div>
                  <textarea
                    value={formsState.carousel.topic}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        carousel: { ...prev.carousel, topic: e.target.value },
                      }))
                    }
                    placeholder={currentConfig.inputPlaceholder}
                    rows={3}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y font-sans"
                    disabled={isGenerating}
                  />
                  {currentTextLength > 0 && currentTextLength < currentConfig.minChars && (
                    <p className="text-[11px] text-rose-400">
                      Topic must be at least {currentConfig.minChars} characters.
                    </p>
                  )}
                </div>

                {/* Tone of Voice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Tone of Voice <span className="text-devpilot-subtle font-normal">(Optional, max 100)</span>
                  </label>
                  <Input
                    value={formsState.carousel.tone}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        carousel: { ...prev.carousel, tone: e.target.value },
                      }))
                    }
                    placeholder="e.g. Authoritative, educational, punchy..."
                    className="h-9 text-xs"
                    disabled={isGenerating}
                    maxLength={100}
                  />
                </div>

                {/* Number of Slides (5–10, default 7) */}
                <div className="space-y-2 p-3 rounded-lg bg-devpilot-surface/60 border border-devpilot-border/60">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text flex items-center gap-2">
                      <span>Number of Slides</span>
                      <Badge variant="purple" className="text-[10px] font-mono px-1.5 py-0">
                        {formsState.carousel.slidesCount} Slides
                      </Badge>
                    </label>
                    <span className="text-[11px] text-devpilot-subtle">Range: 5 to 10</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={5}
                      max={10}
                      step={1}
                      value={formsState.carousel.slidesCount}
                      onChange={(e) =>
                        setFormsState((prev) => ({
                          ...prev,
                          carousel: {
                            ...prev.carousel,
                            slidesCount: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full accent-devpilot-purple cursor-pointer h-2 bg-devpilot-bg rounded-lg"
                      disabled={isGenerating}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-xs font-mono"
                        disabled={isGenerating || formsState.carousel.slidesCount <= 5}
                        onClick={() =>
                          setFormsState((prev) => ({
                            ...prev,
                            carousel: {
                              ...prev.carousel,
                              slidesCount: Math.max(5, prev.carousel.slidesCount - 1),
                            },
                          }))
                        }
                      >
                        -
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-xs font-mono"
                        disabled={isGenerating || formsState.carousel.slidesCount >= 10}
                        onClick={() =>
                          setFormsState((prev) => ({
                            ...prev,
                            carousel: {
                              ...prev.carousel,
                              slidesCount: Math.min(10, prev.carousel.slidesCount + 1),
                            },
                          }))
                        }
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Target Audience */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Target Audience <span className="text-devpilot-subtle font-normal">(Optional, max 200)</span>
                  </label>
                  <Input
                    value={formsState.carousel.targetAudience}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        carousel: { ...prev.carousel, targetAudience: e.target.value },
                      }))
                    }
                    placeholder="e.g. Junior to Mid-level TypeScript Developers..."
                    className="h-9 text-xs"
                    disabled={isGenerating}
                    maxLength={200}
                  />
                </div>

                {/* Additional Instructions */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Additional Instructions <span className="text-devpilot-subtle font-normal">(Optional, max 500)</span>
                  </label>
                  <textarea
                    value={formsState.carousel.additionalInstructions}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        carousel: { ...prev.carousel, additionalInstructions: e.target.value },
                      }))
                    }
                    placeholder="e.g. Focus on practical pitfalls and include code pseudocode cues in visual directions..."
                    rows={2}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y font-sans"
                    disabled={isGenerating}
                    maxLength={500}
                  />
                </div>
              </>
            )}

            {activeTool === 'ideas' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Topic or Theme *
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-mono',
                        currentTextLength > currentConfig.maxChars
                          ? 'text-rose-400 font-bold'
                          : 'text-devpilot-subtle'
                      )}
                    >
                      {currentTextLength}/{currentConfig.maxChars}
                    </span>
                  </div>
                  <textarea
                    value={formsState.ideas.topic}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        ideas: { ...prev.ideas, topic: e.target.value },
                      }))
                    }
                    placeholder={currentConfig.inputPlaceholder}
                    rows={3}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y"
                    disabled={isGenerating}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Target Audience <span className="text-devpilot-subtle font-normal">(Optional)</span>
                  </label>
                  <Input
                    value={formsState.ideas.targetAudience}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        ideas: { ...prev.ideas, targetAudience: e.target.value },
                      }))
                    }
                    placeholder="e.g. Senior Backend Engineers, Tech Leads..."
                    className="h-9 text-xs"
                    disabled={isGenerating}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Format Focus <span className="text-devpilot-subtle font-normal">(Optional)</span>
                  </label>
                  <select
                    value={formsState.ideas.contentType}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        ideas: {
                          ...prev.ideas,
                          contentType: e.target.value as any,
                        },
                      }))
                    }
                    className="w-full h-9 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                    disabled={isGenerating}
                  >
                    <option value="">Any Format</option>
                    <option value="POST">Single Post</option>
                    <option value="CAROUSEL">Carousel</option>
                    <option value="REEL">Reel / Video</option>
                    <option value="STORY">Story</option>
                  </select>
                </div>
              </>
            )}

            {activeTool === 'caption' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Topic or Main Context *
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-mono',
                        currentTextLength > currentConfig.maxChars
                          ? 'text-rose-400 font-bold'
                          : 'text-devpilot-subtle'
                      )}
                    >
                      {currentTextLength}/{currentConfig.maxChars}
                    </span>
                  </div>
                  <textarea
                    value={formsState.caption.topic}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        caption: { ...prev.caption, topic: e.target.value },
                      }))
                    }
                    placeholder={currentConfig.inputPlaceholder}
                    rows={4}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y"
                    disabled={isGenerating}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Tone of Voice <span className="text-devpilot-subtle font-normal">(Optional)</span>
                  </label>
                  <Input
                    value={formsState.caption.tone}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        caption: { ...prev.caption, tone: e.target.value },
                      }))
                    }
                    placeholder="e.g. Authoritative yet conversational, witty..."
                    className="h-9 text-xs"
                    disabled={isGenerating}
                  />
                </div>
              </>
            )}

            {activeTool === 'hooks' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Topic or Main Takeaway *
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-mono',
                        currentTextLength > currentConfig.maxChars
                          ? 'text-rose-400 font-bold'
                          : 'text-devpilot-subtle'
                      )}
                    >
                      {currentTextLength}/{currentConfig.maxChars}
                    </span>
                  </div>
                  <textarea
                    value={formsState.hooks.topic}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        hooks: { ...prev.hooks, topic: e.target.value },
                      }))
                    }
                    placeholder={currentConfig.inputPlaceholder}
                    rows={3}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y"
                    disabled={isGenerating}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Hook Style <span className="text-devpilot-subtle font-normal">(Optional)</span>
                  </label>
                  <Input
                    value={formsState.hooks.style}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        hooks: { ...prev.hooks, style: e.target.value },
                      }))
                    }
                    placeholder="e.g. Curiosity gap, contrarian, data-driven..."
                    className="h-9 text-xs"
                    disabled={isGenerating}
                  />
                </div>
              </>
            )}

            {activeTool === 'hashtags' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Post Content or Keywords *
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-mono',
                        currentTextLength > currentConfig.maxChars
                          ? 'text-rose-400 font-bold'
                          : 'text-devpilot-subtle'
                      )}
                    >
                      {currentTextLength}/{currentConfig.maxChars}
                    </span>
                  </div>
                  <textarea
                    value={formsState.hashtags.content}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        hashtags: { ...prev.hashtags, content: e.target.value },
                      }))
                    }
                    placeholder={currentConfig.inputPlaceholder}
                    rows={3}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y"
                    disabled={isGenerating}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Hashtag Count ({formsState.hashtags.limit})
                    </label>
                    <span className="text-[11px] text-devpilot-subtle">10 to 25 tags</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={25}
                    value={formsState.hashtags.limit}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        hashtags: {
                          ...prev.hashtags,
                          limit: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full accent-devpilot-purple cursor-pointer"
                    disabled={isGenerating}
                  />
                </div>
              </>
            )}

            {activeTool === 'cta' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Desired Action or Goal *
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-mono',
                        currentTextLength > currentConfig.maxChars
                          ? 'text-rose-400 font-bold'
                          : 'text-devpilot-subtle'
                      )}
                    >
                      {currentTextLength}/{currentConfig.maxChars}
                    </span>
                  </div>
                  <textarea
                    value={formsState.cta.goal}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        cta: { ...prev.cta, goal: e.target.value },
                      }))
                    }
                    placeholder={currentConfig.inputPlaceholder}
                    rows={3}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y"
                    disabled={isGenerating}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">
                    Target Platform <span className="text-devpilot-subtle font-normal">(Optional)</span>
                  </label>
                  <select
                    value={formsState.cta.platform}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        cta: {
                          ...prev.cta,
                          platform: e.target.value as any,
                        },
                      }))
                    }
                    className="w-full h-9 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                    disabled={isGenerating}
                  >
                    <option value="">All Platforms</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="X">X (Twitter)</option>
                    <option value="FACEBOOK">Facebook</option>
                    <option value="WHATSAPP">WhatsApp</option>
                  </select>
                </div>
              </>
            )}

            {activeTool === 'rewrite' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-devpilot-text">
                      Draft Text to Rewrite *
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-mono',
                        currentTextLength > currentConfig.maxChars
                          ? 'text-rose-400 font-bold'
                          : 'text-devpilot-subtle'
                      )}
                    >
                      {currentTextLength}/{currentConfig.maxChars}
                    </span>
                  </div>
                  <textarea
                    value={formsState.rewrite.text}
                    onChange={(e) =>
                      setFormsState((prev) => ({
                        ...prev,
                        rewrite: { ...prev.rewrite, text: e.target.value },
                      }))
                    }
                    placeholder={currentConfig.inputPlaceholder}
                    rows={5}
                    className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple resize-y font-sans"
                    disabled={isGenerating}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-devpilot-text">
                      Rewrite Mode
                    </label>
                    <select
                      value={formsState.rewrite.mode}
                      onChange={(e) =>
                        setFormsState((prev) => ({
                          ...prev,
                          rewrite: {
                            ...prev.rewrite,
                            mode: e.target.value as any,
                          },
                        }))
                      }
                      className="w-full h-9 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                      disabled={isGenerating}
                    >
                      <option value="REWRITE">Rewrite (Refine)</option>
                      <option value="SHORTEN">Shorten</option>
                      <option value="EXPAND">Expand</option>
                      <option value="TONE_ADJUST">Tone Adjust</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-devpilot-text">
                      Target Tone <span className="text-devpilot-subtle font-normal">(Optional)</span>
                    </label>
                    <Input
                      value={formsState.rewrite.targetTone}
                      onChange={(e) =>
                        setFormsState((prev) => ({
                          ...prev,
                          rewrite: { ...prev.rewrite, targetTone: e.target.value },
                        }))
                      }
                      placeholder="e.g. Casual, concise..."
                      className="h-9 text-xs"
                      disabled={isGenerating}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Validation / Minimum character hint */}
            {currentTextLength > 0 && currentTextLength < currentConfig.minChars && (
              <p className="text-xs text-amber-400/90 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Minimum {currentConfig.minChars} characters required ({currentConfig.minChars - currentTextLength} more needed).
                </span>
              </p>
            )}

            {/* Engine Gating Notice (if blocked) */}
            {!readiness.canGenerate && readiness.reason && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{readiness.reason}</span>
              </div>
            )}

            {/* API Error Notification */}
            {generationError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block">Generation Error</span>
                  <span className="text-rose-300/90">{generationError}</span>
                </div>
              </div>
            )}

            {/* Actions: Generate & Clear */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isGenerating}
                disabled={!canSubmit}
                className="flex-1 gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isGenerating ? 'Generating...' : `Generate ${currentConfig.name}`}</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={handleClearCurrentInput}
                disabled={isGenerating || currentTextLength === 0}
                className="text-xs text-devpilot-muted hover:text-devpilot-text"
                title="Clear input"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: Structured Output Card */}
        <div className="lg:col-span-7">
          <div className="p-5 rounded-xl border border-devpilot-border bg-devpilot-card shadow-sm min-h-[380px]">
            <AIOutputContainer
              toolId={activeTool}
              isGenerating={isGenerating}
              outputData={outputsState[activeTool]?.data}
              meta={outputsState[activeTool]?.meta || null}
              onSaveToDraft={(itemIndex) => {
                setSaveModalInitialIndex(itemIndex);
                setIsSaveModalOpen(true);
              }}
              isDraftSaved={
                outputsState[activeTool]?.meta?.historyId
                  ? savedHistoryIds.has(outputsState[activeTool]!.meta.historyId)
                  : false
              }
            />
          </div>
        </div>
      </div>

      {/* Save-to-Draft Modal Integration */}
      {outputsState[activeTool]?.meta && (
        <SaveToDraftModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          toolId={activeTool}
          historyId={outputsState[activeTool]!.meta.historyId}
          outputData={outputsState[activeTool]!.data}
          userRole={user?.role}
          initialItemIndex={saveModalInitialIndex}
          onSuccess={(createdPost) => {
            const hId = outputsState[activeTool]?.meta.historyId;
            if (hId) {
              setSavedHistoryIds((prev) => new Set(prev).add(hId));
            }
          }}
        />
      )}
    </div>
  );
}
