'use client';

import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export default function ContentCalendarPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Calendar"
        description="Schedule and visualize CodeCulture publishing slots across month, week, and list views."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Content Calendar' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-devpilot-border rounded-lg bg-devpilot-card p-0.5">
              <button className="px-2.5 py-1 text-xs font-medium rounded-md bg-devpilot-purple text-white">
                Month
              </button>
              <button className="px-2.5 py-1 text-xs font-medium rounded-md text-devpilot-muted hover:text-devpilot-text">
                Week
              </button>
              <button className="px-2.5 py-1 text-xs font-medium rounded-md text-devpilot-muted hover:text-devpilot-text">
                List
              </button>
            </div>
            <Button size="sm">
              <Plus className="w-4 h-4" />
              <span>Schedule Post</span>
            </Button>
          </div>
        }
      />

      {/* Month Navigator Header */}
      <div className="flex items-center justify-between p-4 bg-devpilot-card rounded-xl border border-devpilot-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-devpilot-text">November 2026</span>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <span className="text-xs text-devpilot-subtle">UTC Timezone</span>
      </div>

      <EmptyState
        icon={CalendarIcon}
        title="No Content Scheduled on Calendar"
        description="The calendar shell is ready. Approved posts will be draggable and schedulable in Milestone 1.5."
        actionLabel="Schedule Post"
        onAction={() => alert('Calendar scheduling workflow will be activated in Milestone 1.5.')}
      />
    </div>
  );
}
