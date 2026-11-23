import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            'flex h-10 w-full rounded-lg border border-devpilot-border bg-devpilot-card/80 px-3 py-2 text-sm text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:ring-2 focus:ring-devpilot-purple focus:border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-devpilot-danger focus:ring-devpilot-danger',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="text-xs text-devpilot-danger mt-1.5">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
