'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Sparkles,
  Compass,
  FolderKanban,
  Calendar,
  CheckCircle2,
  Image as ImageIcon,
  Share2,
  BarChart3,
  Palette,
  Bot,
  Sliders,
  Globe2,
  ScrollText,
} from 'lucide-react';

export const navigationItems = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'AI Studio', href: '/studio', icon: Sparkles, phase: 'Phase 2' },
  { name: 'Trend Explorer', href: '/trends', icon: Compass, phase: 'Phase 3' },
  { name: 'Content Library', href: '/content', icon: FolderKanban },
  { name: 'Content Calendar', href: '/calendar', icon: Calendar },
  { name: 'Approval Center', href: '/approvals', icon: CheckCircle2 },
  { name: 'Media Library', href: '/media', icon: ImageIcon },
  { name: 'Social Accounts', href: '/social', icon: Share2, phase: 'Phase 5' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, phase: 'Phase 6' },
];

export const settingsItems = [
  { name: 'Brand Settings', href: '/settings/brand', icon: Palette },
  { name: 'AI Agent Settings', href: '/settings/agent', icon: Bot, phase: 'Phase 2' },
  { name: 'Content Preferences', href: '/settings/preferences', icon: Sliders },
  { name: 'Platform Settings', href: '/settings/platforms', icon: Globe2 },
  { name: 'Activity Logs', href: '/settings/logs', icon: ScrollText },
];

interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname();

  const isLinkActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        'w-64 bg-devpilot-sidebar border-r border-devpilot-border flex flex-col h-full select-none',
        className
      )}
    >
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center gap-3 border-b border-devpilot-border shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-devpilot-purple to-devpilot-cyan flex items-center justify-center shadow-md shadow-purple-900/30 shrink-0">
          <span className="font-bold text-white text-base tracking-wider">DP</span>
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-devpilot-text text-base tracking-tight truncate">
              DevPilot
            </span>
          </div>
          <span className="text-[11px] font-medium text-devpilot-muted truncate">
            CodeCulture Command
          </span>
        </div>
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-devpilot-subtle">
            Workspace
          </div>
          <nav className="space-y-1">
            {navigationItems.map((item) => {
              const active = isLinkActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group',
                    active
                      ? 'bg-devpilot-purple/15 text-devpilot-purple border border-devpilot-purple/20'
                      : 'text-devpilot-muted hover:text-devpilot-text hover:bg-white/[0.04]'
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        active ? 'text-devpilot-purple' : 'text-devpilot-subtle group-hover:text-devpilot-text'
                      )}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>
                  {item.phase && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-devpilot-subtle border border-white/10 shrink-0">
                      {item.phase}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-devpilot-subtle">
            Settings & Control
          </div>
          <nav className="space-y-1">
            {settingsItems.map((item) => {
              const active = isLinkActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group',
                    active
                      ? 'bg-devpilot-purple/15 text-devpilot-purple border border-devpilot-purple/20'
                      : 'text-devpilot-muted hover:text-devpilot-text hover:bg-white/[0.04]'
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        active ? 'text-devpilot-purple' : 'text-devpilot-subtle group-hover:text-devpilot-text'
                      )}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>
                  {item.phase && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-devpilot-subtle border border-white/10 shrink-0">
                      {item.phase}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Brand Identity Footer */}
      <div className="p-3 border-t border-devpilot-border/60 bg-devpilot-card/40">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-devpilot-card border border-devpilot-border/80">
          <div className="w-2 h-2 rounded-full bg-devpilot-success animate-pulse shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-semibold text-devpilot-text truncate">
              CodeCulture
            </span>
            <span className="text-[10px] text-devpilot-muted truncate">
              Code. Create. Build. Repeat.
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
