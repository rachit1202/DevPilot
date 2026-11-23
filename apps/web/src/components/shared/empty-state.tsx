import React from 'react';
import { LucideIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  badge?: string;
}

export function EmptyState({
  icon: Icon = Sparkles,
  title,
  description,
  actionLabel,
  onAction,
  badge,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed border-devpilot-border rounded-xl bg-devpilot-card/40 my-4">
      {badge && (
        <span className="mb-4 text-xs font-mono font-medium text-devpilot-cyan bg-devpilot-cyan/10 border border-devpilot-cyan/30 px-3 py-1 rounded-full">
          {badge}
        </span>
      )}
      <div className="w-12 h-12 rounded-2xl bg-devpilot-border/50 border border-devpilot-border flex items-center justify-center text-devpilot-muted mb-4 shadow-inner">
        <Icon className="w-6 h-6 text-devpilot-purple" />
      </div>
      <h3 className="text-lg font-semibold text-devpilot-text">{title}</h3>
      <p className="text-sm text-devpilot-muted max-w-md mt-1.5">{description}</p>
      {actionLabel && (
        <Button onClick={onAction} className="mt-5" variant="secondary" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
