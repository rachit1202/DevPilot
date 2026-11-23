import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Bot } from 'lucide-react';

export default function AIAgentSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Agent Settings"
        description="Configure autonomous research cadences, content generation schedules, and posting limits."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Settings', href: '/settings/brand' },
          { label: 'AI Agent Settings' },
        ]}
      />

      <EmptyState
        icon={Bot}
        badge="Planned • Phase 2"
        title="AI Agent Controls Scheduled for Phase 2"
        description="Local Ollama execution parameters, Qwen prompt templates, and intelligent posting frequency recommendations will be configured here in Phase 2."
      />
    </div>
  );
}
