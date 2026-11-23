import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Sliders } from 'lucide-react';

export default function ContentPreferencesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Preferences"
        description="Manage preferred hashtags, CTA templates, and content formatting rules."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Settings', href: '/settings/brand' },
          { label: 'Content Preferences' },
        ]}
      />

      <EmptyState
        icon={Sliders}
        title="Content Preferences"
        description="Default hashtag banks, call-to-action presets, and topic weighting settings will be implemented in Milestone 1.6."
      />
    </div>
  );
}
