'use client';

import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, UploadCloud } from 'lucide-react';

export default function MediaLibraryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Media Library"
        description="Manage images, carousels, and videos safely stored in local filesystem storage."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Media Library' },
        ]}
        actions={
          <Button size="sm">
            <UploadCloud className="w-4 h-4" />
            <span>Upload Media</span>
          </Button>
        }
      />

      <EmptyState
        icon={ImageIcon}
        title="Media Library Ready"
        description="Secure multipart file uploads, dimension checks, and media-to-post attachments will be implemented in Milestone 1.4."
        actionLabel="Upload Media Asset"
        onAction={() => alert('Media upload engine will be connected in Milestone 1.4.')}
      />
    </div>
  );
}
