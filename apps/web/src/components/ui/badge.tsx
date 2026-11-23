import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'purple' | 'cyan' | 'success' | 'warning' | 'danger' | 'outline';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide';

  const variants = {
    default: 'bg-devpilot-border text-devpilot-muted border border-white/5',
    purple: 'bg-devpilot-purple/15 text-purple-300 border border-devpilot-purple/30',
    cyan: 'bg-devpilot-cyan/15 text-cyan-300 border border-devpilot-cyan/30',
    success: 'bg-devpilot-success/15 text-emerald-300 border border-devpilot-success/30',
    warning: 'bg-devpilot-warning/15 text-amber-300 border border-devpilot-warning/30',
    danger: 'bg-devpilot-danger/15 text-rose-300 border border-devpilot-danger/30',
    outline: 'bg-transparent text-devpilot-muted border border-devpilot-border',
  };

  return (
    <div className={cn(baseStyles, variants[variant], className)} {...props}>
      {children}
    </div>
  );
}
