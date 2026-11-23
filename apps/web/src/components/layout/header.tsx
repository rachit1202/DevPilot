'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Bell, LogOut, Menu, Shield, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="h-16 px-6 bg-devpilot-bg/80 backdrop-blur-md border-b border-devpilot-border flex items-center justify-between sticky top-0 z-30">
      {/* Left: Mobile hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 border border-devpilot-border"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs text-devpilot-subtle">
          <span className="font-medium text-devpilot-muted">DevPilot Core</span>
          <span>/</span>
          <span className="text-devpilot-text">Local Command Node (v1.0.0)</span>
        </div>
      </div>

      {/* Right: Notifications & User profile */}
      <div className="flex items-center gap-3">
        {/* Notification Bell Placeholder */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            className="relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 text-devpilot-muted hover:text-devpilot-text" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-devpilot-purple" />
          </Button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl bg-devpilot-card border border-devpilot-border shadow-xl p-4 text-left z-50">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-devpilot-border/60">
                <span className="text-xs font-semibold text-devpilot-text">Notifications</span>
                <span className="text-[10px] text-devpilot-subtle">Phase 1 Sandbox</span>
              </div>
              <div className="text-xs text-devpilot-muted text-center py-6">
                System notifications will appear here. No unread alerts.
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border border-devpilot-border bg-devpilot-card hover:border-devpilot-borderHover transition-colors text-left"
          >
            <div className="w-6 h-6 rounded-full bg-devpilot-purple/20 border border-devpilot-purple/40 flex items-center justify-center text-devpilot-purple shrink-0">
              <UserIcon className="w-3.5 h-3.5" />
            </div>
            <div className="hidden md:flex flex-col min-w-0 pr-1">
              <span className="text-xs font-medium text-devpilot-text truncate max-w-[120px]">
                {user?.name || 'Administrator'}
              </span>
              <span className="text-[10px] text-devpilot-subtle truncate max-w-[120px]">
                {user?.role || 'OWNER'}
              </span>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-devpilot-card border border-devpilot-border shadow-xl p-2 z-50 animate-in fade-in-50">
              <div className="px-3 py-2 border-b border-devpilot-border/60 mb-1">
                <p className="text-xs font-medium text-devpilot-text truncate">{user?.name}</p>
                <p className="text-[11px] text-devpilot-muted truncate mt-0.5">{user?.email}</p>
                <div className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded bg-devpilot-purple/10 border border-devpilot-purple/20 text-[10px] text-devpilot-purple font-mono">
                  <Shield className="w-3 h-3" />
                  <span>{user?.role}</span>
                </div>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-devpilot-danger hover:bg-devpilot-danger/10 rounded-lg transition-colors text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
