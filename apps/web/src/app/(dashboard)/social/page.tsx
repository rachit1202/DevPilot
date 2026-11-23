import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Share2 } from 'lucide-react';

export default function SocialAccountsPlaceholder() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Social Accounts"
        description="Manage verified official platform API connections for CodeCulture."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Social Accounts' },
        ]}
      />

      <EmptyState
        icon={Share2}
        badge="Planned • Phase 5"
        title="Social Integrations are Scheduled for Phase 5"
        description="Official Instagram Professional, Facebook Pages, and WhatsApp Business official APIs will be integrated in Phase 5 with strict encrypted token storage. Per PRD, social publishing APIs are excluded from Phase 1."
      />
    </div>
  );
}
