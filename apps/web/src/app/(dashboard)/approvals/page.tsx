'use client';

import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

export default function ApprovalCenterPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Center"
        description="The strict human-in-the-loop review station. Zero public publishing happens without explicit sign-off."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Approval Center' },
        ]}
      />

      {/* Philosophy Callout */}
      <div className="p-4 rounded-xl bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-start gap-3 text-xs text-purple-200">
        <ShieldCheck className="w-5 h-5 text-devpilot-purple shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-white">Strict Human Gate Active</p>
          <p className="mt-0.5 text-devpilot-muted">
            CodeCulture posts submitted for review must be vetted by an Owner or Approver. Reviewers can approve, reject, or request changes before any publishing queue can accept them.
          </p>
        </div>
      </div>

      <EmptyState
        icon={CheckCircle2}
        title="No Content Awaiting Approval"
        description="All submissions have been reviewed. When drafts are submitted for approval, they will appear here with complete side-by-side post previews and action controls in Milestone 1.5."
      />
    </div>
  );
}
