import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-devpilot-bg disabled:opacity-50 disabled:pointer-events-none select-none';

    const variants = {
      primary: 'bg-devpilot-purple hover:bg-devpilot-purpleHover text-white focus:ring-devpilot-purple shadow-sm shadow-purple-950/40',
      secondary: 'bg-devpilot-card hover:bg-devpilot-cardHover text-devpilot-text border border-devpilot-border hover:border-devpilot-borderHover focus:ring-devpilot-border',
      outline: 'bg-transparent border border-devpilot-cyan/40 hover:border-devpilot-cyan text-devpilot-cyan hover:bg-devpilot-cyan/10 focus:ring-devpilot-cyan',
      ghost: 'bg-transparent hover:bg-white/5 text-devpilot-muted hover:text-devpilot-text focus:ring-devpilot-border',
      danger: 'bg-devpilot-danger hover:bg-red-600 text-white focus:ring-red-500 shadow-sm shadow-red-950/40',
    };

    const sizes = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5',
      md: 'text-sm px-4 py-2 gap-2',
      lg: 'text-base px-5 py-2.5 gap-2.5',
      icon: 'h-9 w-9 p-0',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
