import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Sparkles } from 'lucide-react';

export default function AIStudioPlaceholder() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Studio"
        description="AI-driven content ideation, caption generation, hook writing, and developer meme synthesis."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'AI Studio' },
        ]}
      />

      <EmptyState
        icon={Sparkles}
        badge="Planned • Phase 2"
        title="AI Studio is Scheduled for Phase 2"
        description="Local AI inference (Ollama with open-source Qwen models) will be integrated in Phase 2 for zero-paid-dependency content generation. Per PRD, AI dependencies are excluded from Phase 1."
      />
    </div>
  );
}
