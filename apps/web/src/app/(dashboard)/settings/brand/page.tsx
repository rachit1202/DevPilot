'use client';

import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Palette, Check } from 'lucide-react';

export default function BrandSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Brand Settings"
        description="Configure CodeCulture identity, brand colors, voice, and default topics."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Settings', href: '/settings/brand' },
          { label: 'Brand Settings' },
        ]}
        actions={
          <Button size="sm">
            <Check className="w-4 h-4" />
            <span>Save Settings</span>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Public Brand Identity</CardTitle>
              <CardDescription>The core identity of the brand managed by DevPilot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Brand Name
                </label>
                <Input defaultValue="CodeCulture" readOnly className="bg-devpilot-bg/50" />
              </div>

              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Brand Tagline
                </label>
                <Input defaultValue="Code. Create. Build. Repeat." readOnly className="bg-devpilot-bg/50" />
              </div>

              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Portfolio / Website URL
                </label>
                <Input defaultValue="https://codeculture.dev" readOnly className="bg-devpilot-bg/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand Colors & Palette</CardTitle>
              <CardDescription>Primary and accent colors used across content graphics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-devpilot-bg/50 border border-devpilot-border">
                  <div className="w-9 h-9 rounded-lg bg-[#8B5CF6] shrink-0 border border-white/20 shadow-sm" />
                  <div>
                    <p className="text-xs font-medium text-devpilot-text">Primary Purple</p>
                    <p className="text-[11px] font-mono text-devpilot-muted">#8B5CF6</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-devpilot-bg/50 border border-devpilot-border">
                  <div className="w-9 h-9 rounded-lg bg-[#06B6D4] shrink-0 border border-white/20 shadow-sm" />
                  <div>
                    <p className="text-xs font-medium text-devpilot-text">Secondary Cyan</p>
                    <p className="text-[11px] font-mono text-devpilot-muted">#06B6D4</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-devpilot-purple mb-1">
                <Palette className="w-4 h-4" />
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">
                  Seeded in Database
                </span>
              </div>
              <CardTitle>Content Voice & Tone</CardTitle>
              <CardDescription>Guidelines applied to AI drafts and templates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-devpilot-muted">
              <p>
                <strong className="text-devpilot-text">Tone:</strong> Modern, developer-friendly, humorous but informative, creative.
              </p>
              <p>
                <strong className="text-devpilot-text">Audience:</strong> Web developers, students, freelancers, AI vibe-coders, startup founders.
              </p>
              <p>
                <strong className="text-devpilot-text">Topics:</strong> Coding Memes, Web Dev Tips, AI & Vibe Coding, Developer Life, Tutorials.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
