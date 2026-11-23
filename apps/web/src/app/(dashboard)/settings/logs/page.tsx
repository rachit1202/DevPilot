import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ScrollText } from 'lucide-react';

export default function ActivityLogsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Logs"
        description="Chronological audit trail of all logins, content edits, approvals, and system state transitions."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Settings', href: '/settings/brand' },
          { label: 'Activity Logs' },
        ]}
      />

      <EmptyState
        icon={ScrollText}
        title="Audit Logs Engine Active"
        description="Activity events are already being captured into the PostgreSQL activity_logs table via ActivityService. A full searchable table viewer will be connected in Milestone 1.6."
      />
    </div>
  );
}
