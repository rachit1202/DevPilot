'use client';

import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderKanban, Plus, Search, Filter } from 'lucide-react';

export default function ContentLibraryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Library"
        description="All CodeCulture social posts, concepts, and drafts stored in PostgreSQL."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Content Library' },
        ]}
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4" />
            <span>Create Post</span>
          </Button>
        }
      />

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-devpilot-card rounded-xl border border-devpilot-border">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-devpilot-subtle" />
          <Input
            placeholder="Search by title, caption, or #hashtag..."
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="text-xs">
            <Filter className="w-3.5 h-3.5" />
            <span>All Categories</span>
          </Button>
          <Button variant="secondary" size="sm" className="text-xs">
            <span>Status: All</span>
          </Button>
        </div>
      </div>

      {/* Empty State Shell */}
      <EmptyState
        icon={FolderKanban}
        title="No Content Posts Created Yet"
        description="Your Content Library is ready. Full CRUD operations, categories, and media asset linking will be enabled in Milestone 1.4."
        actionLabel="Create First Draft"
        onAction={() => alert('Content CRUD will be connected in Milestone 1.4.')}
      />
    </div>
  );
}
