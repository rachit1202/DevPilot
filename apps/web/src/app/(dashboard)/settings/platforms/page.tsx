import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Globe2 } from 'lucide-react';

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Settings"
        description="Configure publishing limits, rate limits, and fallback rules for connected networks."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Settings', href: '/settings/brand' },
          { label: 'Platform Settings' },
        ]}
      />

      <EmptyState
        icon={Globe2}
        title="Platform Settings"
        description="Platform-specific constraints and publishing rules will be fully activated in Milestone 1.6 alongside Brand settings."
      />
    </div>
  );
}
