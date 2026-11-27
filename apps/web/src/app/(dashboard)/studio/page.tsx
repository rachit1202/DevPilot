'use client';

import React, { useState, useCallback } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { AIStatusBanner } from '@/components/studio/ai-status-banner';
import { AIStudioWorkspace } from '@/components/studio/ai-studio-workspace';
import { AIHistoryTable } from '@/components/studio/ai-history-table';
import { AIStatusData } from '@/lib/ai-api';
import { useAuth } from '@/hooks/useAuth';
import { Sparkles, History } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AIStudioPage() {
  const { user } = useAuth();
  const [engineStatus, setEngineStatus] = useState<AIStatusData | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');

  const handleGenerationSettled = useCallback(() => {
    // Trigger immediate background AI status check whenever inference settles
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Studio"
        description="Local-first AI content generation powered by Ollama and CodeCulture brand context."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'AI Studio' },
        ]}
      />

      {/* Core AI Engine Status Banner */}
      <AIStatusBanner
        onStatusChange={setEngineStatus}
        refreshTrigger={refreshTrigger}
      />

      {/* Studio Navigation Tabs: Generator vs History */}
      <div className="flex items-center gap-2 border-b border-devpilot-border pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('generate')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all select-none border',
            activeTab === 'generate'
              ? 'bg-devpilot-purple/15 border-devpilot-purple/40 text-devpilot-text shadow-sm'
              : 'bg-devpilot-card/70 border-devpilot-border hover:bg-devpilot-card text-devpilot-muted'
          )}
        >
          <Sparkles className={cn('w-4 h-4', activeTab === 'generate' ? 'text-devpilot-purple' : 'text-devpilot-muted')} />
          <span>Generator Workspace</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all select-none border',
            activeTab === 'history'
              ? 'bg-devpilot-purple/15 border-devpilot-purple/40 text-devpilot-text shadow-sm'
              : 'bg-devpilot-card/70 border-devpilot-border hover:bg-devpilot-card text-devpilot-muted'
          )}
        >
          <History className={cn('w-4 h-4', activeTab === 'history' ? 'text-devpilot-purple' : 'text-devpilot-muted')} />
          <span>Generation History</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'generate' ? (
        <AIStudioWorkspace
          engineStatus={engineStatus}
          onGenerationSettled={handleGenerationSettled}
        />
      ) : (
        <AIHistoryTable
          userRole={user?.role}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
}
