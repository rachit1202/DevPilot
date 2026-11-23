import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  icon: LucideIcon;
  iconColor?: 'purple' | 'cyan' | 'success' | 'warning';
  isSample?: boolean;
}

export function StatCard({
  title,
  value,
  change,
  isPositive,
  icon: Icon,
  iconColor = 'purple',
  isSample = false,
}: StatCardProps) {
  const iconColors = {
    purple: 'text-devpilot-purple bg-devpilot-purple/10 border-devpilot-purple/20',
    cyan: 'text-devpilot-cyan bg-devpilot-cyan/10 border-devpilot-cyan/20',
    success: 'text-devpilot-success bg-devpilot-success/10 border-devpilot-success/20',
    warning: 'text-devpilot-warning bg-devpilot-warning/10 border-devpilot-warning/20',
  };

  return (
    <Card className="hover:border-devpilot-borderHover transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-devpilot-muted uppercase tracking-wider">
                {title}
              </span>
              {isSample && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-devpilot-subtle border border-white/10">
                  SAMPLE
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-devpilot-text mt-2">{value}</div>
          </div>
          <div className={cn('p-2.5 rounded-xl border', iconColors[iconColor])}>
            <Icon className="w-5 h-5 shrink-0" />
          </div>
        </div>

        {change && (
          <div className="mt-3 text-xs flex items-center gap-1.5">
            <span className={cn('font-medium', isPositive ? 'text-devpilot-success' : 'text-devpilot-subtle')}>
              {change}
            </span>
            <span className="text-devpilot-subtle">vs. last cycle</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
