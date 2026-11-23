'use client';

import React from 'react';
import { Sidebar } from './sidebar';
import { X } from 'lucide-react';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-72 bg-devpilot-sidebar shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text bg-devpilot-card border border-devpilot-border"
            aria-label="Close Navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <Sidebar onNavigate={onClose} className="border-r-0 w-full" />
      </div>
    </div>
  );
}
