import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Compass } from 'lucide-react';

export default function TrendExplorerPlaceholder() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Trend Explorer"
        description="Automated research across GitHub trending repos, developer news feeds, and vibe-coding topics."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Trend Explorer' },
        ]}
      />

      <EmptyState
        icon={Compass}
        badge="Planned • Phase 3"
        title="Trend Explorer is Scheduled for Phase 3"
        description="Public trend discovery, relevance scoring, and trend-to-draft workflows will be connected in Phase 3. Per PRD, scraping and external trend engines are excluded from Phase 1."
      />
    </div>
  );
}
