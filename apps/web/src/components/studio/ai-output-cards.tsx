'use client';

import React, { useState, useCallback } from 'react';
import {
  IdeasOutput,
  CaptionOutput,
  HooksOutput,
  HashtagsOutput,
  CtaOutput,
  RewriteOutput,
  CarouselOutput,
  CarouselSlide,
} from '@devpilot/validation';
import { AIGenerationMeta } from '@/lib/ai-api';
import {
  copyTextToClipboard,
  formatIdeasForCopy,
  formatCaptionForCopy,
  formatHooksForCopy,
  formatHashtagsForCopy,
  formatCtaForCopy,
  formatRewriteForCopy,
  formatCarouselForCopy,
  formatCarouselSlideForCopy,
  StudioToolId,
} from './ai-studio-logic';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Copy,
  Check,
  Clock,
  Cpu,
  Sparkles,
  Tag,
  Hash,
  Lightbulb,
  FileText,
  Anchor,
  Megaphone,
  Repeat,
  FilePlus,
  CheckCircle2,
  Layers,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ==========================================
// 1. REUSABLE COPY BUTTON WITH FEEDBACK
// ==========================================

interface CopyButtonProps {
  text: string;
  label?: string;
  size?: 'sm' | 'md' | 'icon';
  variant?: 'ghost' | 'outline' | 'secondary' | 'primary';
  className?: string;
  title?: string;
}

export function CopyButton({
  text,
  label,
  size = 'sm',
  variant = 'ghost',
  className,
  title = 'Copy to clipboard',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const success = await copyTextToClipboard(text);
      if (success) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        setCopied(true);
        timerRef.current = setTimeout(() => {
          setCopied(false);
          timerRef.current = null;
        }, 2000);
      }
    },
    [text]
  );

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleCopy}
      className={cn('transition-all', className)}
      title={title}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          {label && <span className="text-emerald-400 font-medium">Copied!</span>}
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          {label && <span>{label}</span>}
        </>
      )}
    </Button>
  );
}

// ==========================================
// 2. METADATA HEADER
// ==========================================

interface OutputHeaderProps {
  title: string;
  toolId: StudioToolId;
  meta: AIGenerationMeta;
  copyAllText: string;
  onSaveToDraft?: () => void;
  isDraftSaved?: boolean;
}

function OutputHeader({
  title,
  toolId,
  meta,
  copyAllText,
  onSaveToDraft,
  isDraftSaved = false,
}: OutputHeaderProps) {
  const getToolIcon = () => {
    switch (toolId) {
      case 'ideas':
        return <Lightbulb className="w-4 h-4 text-amber-400" />;
      case 'caption':
        return <FileText className="w-4 h-4 text-devpilot-cyan" />;
      case 'hooks':
        return <Anchor className="w-4 h-4 text-purple-400" />;
      case 'hashtags':
        return <Hash className="w-4 h-4 text-emerald-400" />;
      case 'cta':
        return <Megaphone className="w-4 h-4 text-rose-400" />;
      case 'rewrite':
        return <Repeat className="w-4 h-4 text-indigo-400" />;
      case 'carousel':
        return <Layers className="w-4 h-4 text-devpilot-purple" />;
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-devpilot-border/70">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-devpilot-surface border border-devpilot-border flex items-center justify-center shrink-0">
          {getToolIcon()}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-devpilot-text flex items-center gap-2">
            {title}
            <Badge variant="purple" className="text-[10px] uppercase font-bold tracking-wider">
              AI Suggestion
            </Badge>
          </h4>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-devpilot-subtle">
            <span className="flex items-center gap-1 font-mono">
              <Cpu className="w-3 h-3 text-devpilot-cyan" />
              {meta.model}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {(meta.durationMs / 1000).toFixed(2)}s
            </span>
            <span>•</span>
            <span className="font-mono text-[10px] text-devpilot-subtle">
              ID: {meta.historyId.slice(0, 8)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        {onSaveToDraft && (
          <Button
            type="button"
            size="sm"
            variant={isDraftSaved ? 'outline' : 'primary'}
            onClick={onSaveToDraft}
            className={cn(
              'text-xs gap-1.5 h-8',
              isDraftSaved && 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
            )}
          >
            {isDraftSaved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Saved as Draft</span>
              </>
            ) : (
              <>
                <FilePlus className="w-3.5 h-3.5" />
                <span>Save to Draft</span>
              </>
            )}
          </Button>
        )}

        <CopyButton
          text={copyAllText}
          label="Copy All"
          variant="secondary"
          size="sm"
          className="text-xs h-8"
        />
      </div>
    </div>
  );
}

// ==========================================
// 3. TOOL OUTPUT CARDS
// ==========================================

export function IdeasOutputCard({
  data,
  meta,
  onSaveToDraft,
  isDraftSaved,
}: {
  data: IdeasOutput;
  meta: AIGenerationMeta;
  onSaveToDraft?: (itemIndex?: number) => void;
  isDraftSaved?: boolean;
}) {
  const fullCopyText = formatIdeasForCopy(data);

  return (
    <div className="space-y-4">
      <OutputHeader
        title="Generated Content Ideas (3 Concepts)"
        toolId="ideas"
        meta={meta}
        copyAllText={fullCopyText}
        onSaveToDraft={onSaveToDraft ? () => onSaveToDraft() : undefined}
        isDraftSaved={isDraftSaved}
      />

      <div className="space-y-3">
        {data.ideas.map((idea, index) => {
          const ideaCopy = `${idea.title}\n\nFormat: ${idea.suggestedFormat} | Angle: ${idea.angle}\n\n${idea.concept}`;
          return (
            <div
              key={index}
              className="p-4 rounded-xl bg-devpilot-surface/70 border border-devpilot-border/80 hover:border-devpilot-purple/40 transition-colors space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-devpilot-purple/20 text-devpilot-purple text-xs font-bold flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <h5 className="text-sm font-semibold text-devpilot-text leading-tight">
                    {idea.title}
                  </h5>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onSaveToDraft && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onSaveToDraft(index)}
                      className="h-7 text-xs px-2 gap-1 text-devpilot-purple hover:text-devpilot-purple hover:bg-devpilot-purple/15"
                      title="Save this idea as a Draft"
                    >
                      <FilePlus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Draft</span>
                    </Button>
                  )}
                  <CopyButton text={ideaCopy} size="icon" className="h-7 w-7" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <Badge variant="cyan" className="text-[10px] font-mono">
                  {idea.suggestedFormat}
                </Badge>
                <Badge variant="purple" className="text-[10px]">
                  {idea.angle}
                </Badge>
              </div>

              <p className="text-xs text-devpilot-muted whitespace-pre-line leading-relaxed">
                {idea.concept}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CaptionOutputCard({
  data,
  meta,
  onSaveToDraft,
  isDraftSaved,
}: {
  data: CaptionOutput;
  meta: AIGenerationMeta;
  onSaveToDraft?: () => void;
  isDraftSaved?: boolean;
}) {
  const fullCopyText = formatCaptionForCopy(data);

  return (
    <div className="space-y-4">
      <OutputHeader
        title="Generated Social Post Caption"
        toolId="caption"
        meta={meta}
        copyAllText={fullCopyText}
        onSaveToDraft={onSaveToDraft}
        isDraftSaved={isDraftSaved}
      />

      {/* Title */}
      {data.title && (
        <div className="p-3 rounded-lg bg-devpilot-surface/70 border border-devpilot-border/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-devpilot-subtle">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-devpilot-cyan">
              Post Title
            </span>
            <CopyButton text={data.title} size="icon" className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-devpilot-text">{data.title}</p>
        </div>
      )}

      {/* Hook */}
      {data.hook && (
        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-purple-300">
              Opening Hook
            </span>
            <CopyButton text={data.hook} size="icon" className="h-6 w-6" />
          </div>
          <p className="text-xs font-medium text-purple-200">{data.hook}</p>
        </div>
      )}

      {/* Main Caption Body */}
      <div className="p-4 rounded-xl bg-devpilot-surface/70 border border-devpilot-border/80 space-y-2">
        <div className="flex items-center justify-between text-xs text-devpilot-subtle">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-devpilot-muted">
            Caption Body
          </span>
          <CopyButton text={data.caption} size="icon" className="h-6 w-6" />
        </div>
        <p className="text-xs text-devpilot-text whitespace-pre-line leading-relaxed">
          {data.caption}
        </p>
      </div>

      {/* Call to Action */}
      {data.cta && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-emerald-300">
              Call to Action (CTA)
            </span>
            <CopyButton text={data.cta} size="icon" className="h-6 w-6" />
          </div>
          <p className="text-xs font-medium text-emerald-200">{data.cta}</p>
        </div>
      )}

      {/* Hashtags */}
      {data.hashtags && data.hashtags.length > 0 && (
        <div className="p-3 rounded-lg bg-devpilot-surface/70 border border-devpilot-border/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-devpilot-subtle">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-devpilot-cyan flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Hashtags ({data.hashtags.length})
            </span>
            <CopyButton
              text={data.hashtags.join(' ')}
              label="Copy Tags"
              size="sm"
              className="text-xs h-7"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.hashtags.map((tag, i) => (
              <span
                key={i}
                onClick={() => copyTextToClipboard(tag)}
                title="Click to copy single hashtag"
                className="cursor-pointer text-[11px] font-mono px-2 py-0.5 rounded bg-devpilot-cyan/10 border border-devpilot-cyan/20 text-devpilot-cyan hover:bg-devpilot-cyan/20 transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function HooksOutputCard({
  data,
  meta,
  onSaveToDraft,
  isDraftSaved,
}: {
  data: HooksOutput;
  meta: AIGenerationMeta;
  onSaveToDraft?: (itemIndex?: number) => void;
  isDraftSaved?: boolean;
}) {
  const fullCopyText = formatHooksForCopy(data);

  return (
    <div className="space-y-4">
      <OutputHeader
        title="Generated Opening Hooks (5 Variations)"
        toolId="hooks"
        meta={meta}
        copyAllText={fullCopyText}
        onSaveToDraft={onSaveToDraft ? () => onSaveToDraft() : undefined}
        isDraftSaved={isDraftSaved}
      />

      <div className="space-y-2.5">
        {data.hooks.map((hook, index) => (
          <div
            key={index}
            className="p-3.5 rounded-xl bg-devpilot-surface/70 border border-devpilot-border/80 hover:border-purple-500/40 transition-colors flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {index + 1}
              </span>
              <p className="text-xs text-devpilot-text font-medium leading-relaxed">
                {hook}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onSaveToDraft && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onSaveToDraft(index)}
                  className="h-7 text-xs px-2 gap-1 text-purple-400 hover:text-purple-300 hover:bg-purple-500/15"
                  title="Save using this hook as a Draft"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Draft</span>
                </Button>
              )}
              <CopyButton text={hook} size="icon" className="h-7 w-7" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HashtagsOutputCard({
  data,
  meta,
  onSaveToDraft,
  isDraftSaved,
}: {
  data: HashtagsOutput;
  meta: AIGenerationMeta;
  onSaveToDraft?: () => void;
  isDraftSaved?: boolean;
}) {
  const fullCopyText = formatHashtagsForCopy(data);

  return (
    <div className="space-y-4">
      <OutputHeader
        title={`Generated Hashtags (${data.hashtags.length} Tags)`}
        toolId="hashtags"
        meta={meta}
        copyAllText={fullCopyText}
        onSaveToDraft={onSaveToDraft}
        isDraftSaved={isDraftSaved}
      />

      <div className="p-4 rounded-xl bg-devpilot-surface/70 border border-devpilot-border/80 space-y-3">
        <p className="text-xs text-devpilot-muted">
          Click any individual hashtag to copy it, or click{' '}
          <span className="font-semibold text-devpilot-text">Copy All</span> above to grab the entire set.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {data.hashtags.map((tag, index) => (
            <span
              key={index}
              onClick={() => copyTextToClipboard(tag)}
              title="Click to copy"
              className="cursor-pointer text-xs font-mono px-2.5 py-1 rounded-lg bg-devpilot-cyan/10 border border-devpilot-cyan/25 text-devpilot-cyan hover:bg-devpilot-cyan/20 hover:border-devpilot-cyan/50 transition-all select-all flex items-center gap-1"
            >
              <Hash className="w-3 h-3 text-devpilot-cyan/60" />
              {tag.startsWith('#') ? tag.slice(1) : tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CtaOutputCard({
  data,
  meta,
  onSaveToDraft,
  isDraftSaved,
}: {
  data: CtaOutput;
  meta: AIGenerationMeta;
  onSaveToDraft?: () => void;
  isDraftSaved?: boolean;
}) {
  const fullCopyText = formatCtaForCopy(data);

  return (
    <div className="space-y-4">
      <OutputHeader
        title="Generated Calls to Action (3 Options)"
        toolId="cta"
        meta={meta}
        copyAllText={fullCopyText}
        onSaveToDraft={onSaveToDraft}
        isDraftSaved={isDraftSaved}
      />

      <div className="space-y-2.5">
        {data.ctas.map((cta, index) => (
          <div
            key={index}
            className="p-3.5 rounded-xl bg-devpilot-surface/70 border border-devpilot-border/80 hover:border-rose-500/40 transition-colors flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {index + 1}
              </span>
              <p className="text-xs text-devpilot-text font-medium leading-relaxed">
                {cta}
              </p>
            </div>
            <CopyButton text={cta} size="icon" className="shrink-0 h-7 w-7" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RewriteOutputCard({
  data,
  meta,
  onSaveToDraft,
  isDraftSaved,
}: {
  data: RewriteOutput;
  meta: AIGenerationMeta;
  onSaveToDraft?: () => void;
  isDraftSaved?: boolean;
}) {
  const fullCopyText = formatRewriteForCopy(data);

  return (
    <div className="space-y-4">
      <OutputHeader
        title="Rewritten Content"
        toolId="rewrite"
        meta={meta}
        copyAllText={fullCopyText}
        onSaveToDraft={onSaveToDraft}
        isDraftSaved={isDraftSaved}
      />

      <div className="p-4 rounded-xl bg-devpilot-surface/70 border border-devpilot-border/80 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="cyan" className="text-[10px] font-mono uppercase">
            Mode: {data.mode}
          </Badge>
          {data.targetTone && (
            <Badge variant="purple" className="text-[10px]">
              Tone: {data.targetTone}
            </Badge>
          )}
        </div>

        <div className="p-3 rounded-lg bg-devpilot-card border border-devpilot-border/60">
          <p className="text-xs text-devpilot-text whitespace-pre-line leading-relaxed font-sans">
            {data.rewrittenText}
          </p>
        </div>
      </div>
    </div>
  );
}

export function CarouselOutputCard({
  data,
  meta,
}: {
  data: CarouselOutput;
  meta: AIGenerationMeta;
}) {
  const fullCopyText = formatCarouselForCopy(data);

  return (
    <div className="space-y-5">
      <OutputHeader
        title="Carousel Outline"
        toolId="carousel"
        meta={meta}
        copyAllText={fullCopyText}
      />

      {/* Deck Metadata Summary */}
      <div className="p-4 rounded-xl bg-devpilot-surface/70 border border-devpilot-border/80 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-devpilot-text tracking-tight">
            {data.title}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="purple" className="text-[10px] font-mono">
              {data.slides.length} Slides
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-devpilot-muted pt-1 border-t border-devpilot-border/40">
          <div>
            <span className="text-devpilot-subtle">Topic: </span>
            <span className="text-devpilot-text font-medium">{data.topic}</span>
          </div>
          {data.targetAudience && (
            <div>
              <span className="text-devpilot-subtle">Audience: </span>
              <span className="text-devpilot-text font-medium">{data.targetAudience}</span>
            </div>
          )}
        </div>
      </div>

      {/* Ordered Slides List */}
      <div className="space-y-3.5">
        {data.slides.map((slide) => {
          const slideCopyText = formatCarouselSlideForCopy(slide);

          // Type-specific badge styles & accent borders
          let badgeVariant: 'purple' | 'cyan' | 'default' = 'default';
          let borderClass = 'hover:border-devpilot-borderHover';
          let typeLabel = slide.slideType;

          if (slide.slideType === 'COVER') {
            badgeVariant = 'purple';
            borderClass = 'border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50';
          } else if (slide.slideType === 'BODY') {
            badgeVariant = 'cyan';
            borderClass = 'border-cyan-500/20 bg-cyan-500/5 hover:border-cyan-500/40';
          } else if (slide.slideType === 'CTA') {
            badgeVariant = 'default';
            borderClass = 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50';
          }

          return (
            <div
              key={slide.slideNumber}
              className={cn(
                'p-4 rounded-xl bg-devpilot-surface/70 border transition-all space-y-3',
                borderClass
              )}
            >
              {/* Slide Card Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-5 h-5 rounded-full bg-devpilot-surface border border-devpilot-border text-devpilot-text text-xs font-bold font-mono flex items-center justify-center">
                    {slide.slideNumber}
                  </span>
                  <Badge variant={badgeVariant} className="text-[10px] font-bold tracking-wider">
                    {typeLabel}
                  </Badge>
                  <span className="text-xs font-bold text-devpilot-text">
                    {slide.title}
                  </span>
                </div>
                <CopyButton
                  text={slideCopyText}
                  size="icon"
                  className="shrink-0 h-7 w-7"
                  title="Copy this slide"
                />
              </div>

              {/* Hook (typically on COVER) */}
              {slide.hook && (
                <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
                  <span className="font-semibold text-purple-300 block mb-0.5">Hook:</span>
                  <p className="text-devpilot-text leading-relaxed">{slide.hook}</p>
                </div>
              )}

              {/* Main Slide Content */}
              <div className="p-3 rounded-lg bg-devpilot-card border border-devpilot-border/60">
                <p className="text-xs text-devpilot-text whitespace-pre-line leading-relaxed font-sans">
                  {slide.content}
                </p>
              </div>

              {/* Slide CTA (typically on CTA slide) */}
              {slide.cta && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                  <span className="font-semibold text-emerald-400 block mb-0.5">Call to Action:</span>
                  <p className="text-devpilot-text font-medium leading-relaxed">{slide.cta}</p>
                </div>
              )}

              {/* Visual Direction / Design Cues */}
              {slide.visualDirection && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-devpilot-bg/60 border border-devpilot-border/40 text-[11px] text-devpilot-subtle">
                  <Eye className="w-3.5 h-3.5 text-devpilot-cyan shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-devpilot-muted">Visual Direction: </span>
                    <span>{slide.visualDirection}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 4. MASTER OUTPUT DISPATCHER
// ==========================================

export interface AIOutputContainerProps {
  toolId: StudioToolId;
  isGenerating: boolean;
  outputData: any;
  meta: AIGenerationMeta | null;
  onSaveToDraft?: (itemIndex?: number) => void;
  isDraftSaved?: boolean;
}

export function AIOutputContainer({
  toolId,
  isGenerating,
  outputData,
  meta,
  onSaveToDraft,
  isDraftSaved,
}: AIOutputContainerProps) {
  if (isGenerating) {
    return (
      <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 rounded-xl border border-devpilot-border bg-devpilot-card/40 text-center animate-pulse">
        <div className="w-12 h-12 rounded-xl bg-devpilot-purple/20 border border-devpilot-purple/30 text-devpilot-purple flex items-center justify-center mb-3">
          <Sparkles className="w-6 h-6 animate-spin" />
        </div>
        <h4 className="text-sm font-semibold text-devpilot-text">Running Local Inference...</h4>
        <p className="text-xs text-devpilot-muted mt-1 max-w-sm">
          Ollama is generating content using CodeCulture brand context. Please wait while tokens stream.
        </p>
      </div>
    );
  }

  if (!outputData || !meta) {
    return (
      <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-devpilot-border bg-devpilot-card/20 text-center">
        <div className="w-12 h-12 rounded-xl bg-devpilot-surface border border-devpilot-border text-devpilot-subtle flex items-center justify-center mb-3">
          <Sparkles className="w-6 h-6 text-devpilot-muted" />
        </div>
        <h4 className="text-sm font-semibold text-devpilot-text">No Generation Yet</h4>
        <p className="text-xs text-devpilot-muted mt-1 max-w-xs">
          Select parameters on the left and click <span className="text-devpilot-purple font-medium">Generate</span> to produce AI suggestions.
        </p>
      </div>
    );
  }

  switch (toolId) {
    case 'ideas':
      return (
        <IdeasOutputCard
          data={outputData as IdeasOutput}
          meta={meta}
          onSaveToDraft={onSaveToDraft}
          isDraftSaved={isDraftSaved}
        />
      );
    case 'caption':
      return (
        <CaptionOutputCard
          data={outputData as CaptionOutput}
          meta={meta}
          onSaveToDraft={onSaveToDraft ? () => onSaveToDraft() : undefined}
          isDraftSaved={isDraftSaved}
        />
      );
    case 'hooks':
      return (
        <HooksOutputCard
          data={outputData as HooksOutput}
          meta={meta}
          onSaveToDraft={onSaveToDraft}
          isDraftSaved={isDraftSaved}
        />
      );
    case 'hashtags':
      return (
        <HashtagsOutputCard
          data={outputData as HashtagsOutput}
          meta={meta}
          onSaveToDraft={onSaveToDraft ? () => onSaveToDraft() : undefined}
          isDraftSaved={isDraftSaved}
        />
      );
    case 'cta':
      return (
        <CtaOutputCard
          data={outputData as CtaOutput}
          meta={meta}
          onSaveToDraft={onSaveToDraft ? () => onSaveToDraft() : undefined}
          isDraftSaved={isDraftSaved}
        />
      );
    case 'rewrite':
      return (
        <RewriteOutputCard
          data={outputData as RewriteOutput}
          meta={meta}
          onSaveToDraft={onSaveToDraft ? () => onSaveToDraft() : undefined}
          isDraftSaved={isDraftSaved}
        />
      );
    case 'carousel':
      return (
        <CarouselOutputCard
          data={outputData as CarouselOutput}
          meta={meta}
        />
      );
    default:
      return null;
  }
}
