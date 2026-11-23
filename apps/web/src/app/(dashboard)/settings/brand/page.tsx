'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/api';
import {
  Palette,
  Check,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Plus,
  X,
  Sparkles,
} from 'lucide-react';

interface BrandSettingsData {
  id: string;
  brandName: string;
  tagline: string;
  description?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  tone: string;
  audience: string;
  industry?: string | null;
  primaryLanguage?: string | null;
  guidelines?: string | null;
  topics: string[];
  avoidTopics: string[];
  ctaDefaults?: string | null;
  updatedAt?: string;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function BrandSettingsPage() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [initialData, setInitialData] = useState<BrandSettingsData | null>(null);
  const [formData, setFormData] = useState<BrandSettingsData | null>(null);
  const [newTopic, setNewTopic] = useState('');
  const [newAvoidTopic, setNewAvoidTopic] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isOwnerOrAdmin = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  // Fetch current user and brand settings
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [userRes, brandRes] = await Promise.all([
        apiRequest<{ success: boolean; data: { user: UserProfile } }>('/auth/me'),
        apiRequest<{ success: boolean; data: BrandSettingsData }>('/settings/brand'),
      ]);

      if (userRes.success && userRes.data) {
        setCurrentUser(userRes.data.user);
      }

      if (brandRes.success && brandRes.data) {
        const brand = brandRes.data;
        const normalized: BrandSettingsData = {
          id: brand.id,
          brandName: brand.brandName || 'CodeCulture',
          tagline: brand.tagline || 'Code. Create. Build. Repeat.',
          description: brand.description || '',
          websiteUrl: brand.websiteUrl || '',
          logoUrl: brand.logoUrl || '',
          primaryColor: brand.primaryColor || '#8B5CF6',
          secondaryColor: brand.secondaryColor || '#06B6D4',
          tone: brand.tone || '',
          audience: brand.audience || '',
          industry: brand.industry || 'Developer Education & Tech Media',
          primaryLanguage: brand.primaryLanguage || 'en',
          guidelines: brand.guidelines || '',
          topics: Array.isArray(brand.topics) ? brand.topics : [],
          avoidTopics: Array.isArray(brand.avoidTopics) ? brand.avoidTopics : [],
          ctaDefaults: brand.ctaDefaults || '',
          updatedAt: brand.updatedAt,
        };
        setInitialData(normalized);
        setFormData(normalized);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to load brand settings from database.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Handle text field changes
  const handleChange = (field: keyof BrandSettingsData, value: string) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
    setSuccessMessage(null);
  };

  // Add a topic tag
  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim() || !formData) return;
    if (!formData.topics.includes(newTopic.trim())) {
      setFormData({ ...formData, topics: [...formData.topics, newTopic.trim()] });
    }
    setNewTopic('');
  };

  // Remove a topic tag
  const handleRemoveTopic = (topic: string) => {
    if (!formData) return;
    setFormData({ ...formData, topics: formData.topics.filter((t) => t !== topic) });
  };

  // Add an avoid-topic tag
  const handleAddAvoidTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAvoidTopic.trim() || !formData) return;
    if (!formData.avoidTopics.includes(newAvoidTopic.trim())) {
      setFormData({ ...formData, avoidTopics: [...formData.avoidTopics, newAvoidTopic.trim()] });
    }
    setNewAvoidTopic('');
  };

  // Remove an avoid-topic tag
  const handleRemoveAvoidTopic = (topic: string) => {
    if (!formData) return;
    setFormData({ ...formData, avoidTopics: formData.avoidTopics.filter((t) => t !== topic) });
  };

  // Check if form is dirty
  const isDirty = initialData && formData && JSON.stringify(initialData) !== JSON.stringify(formData);

  // Revert changes
  const handleCancel = () => {
    if (initialData) {
      setFormData({ ...initialData });
      setError(null);
      setSuccessMessage(null);
    }
  };

  // Save changes
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData || !isOwnerOrAdmin) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    // Basic frontend checks
    if (!formData.brandName.trim()) {
      setError('Brand name is required.');
      setIsSaving(false);
      return;
    }
    if (!formData.tagline.trim()) {
      setError('Brand tagline is required.');
      setIsSaving(false);
      return;
    }

    try {
      const payload = {
        brandName: formData.brandName.trim(),
        tagline: formData.tagline.trim(),
        description: formData.description?.trim() || null,
        websiteUrl: formData.websiteUrl?.trim() || null,
        logoUrl: formData.logoUrl?.trim() || null,
        primaryColor: formData.primaryColor,
        secondaryColor: formData.secondaryColor,
        tone: formData.tone.trim(),
        audience: formData.audience.trim(),
        industry: formData.industry?.trim() || null,
        primaryLanguage: formData.primaryLanguage?.trim() || 'en',
        guidelines: formData.guidelines?.trim() || null,
        topics: formData.topics,
        avoidTopics: formData.avoidTopics,
        ctaDefaults: formData.ctaDefaults?.trim() || null,
      };

      const res = await apiRequest<{ success: boolean; data: BrandSettingsData }>('/settings/brand', {
        method: 'PATCH',
        data: payload,
      });

      if (res.success && res.data) {
        const saved = res.data;
        const normalized: BrandSettingsData = {
          id: saved.id,
          brandName: saved.brandName,
          tagline: saved.tagline,
          description: saved.description || '',
          websiteUrl: saved.websiteUrl || '',
          logoUrl: saved.logoUrl || '',
          primaryColor: saved.primaryColor,
          secondaryColor: saved.secondaryColor,
          tone: saved.tone,
          audience: saved.audience,
          industry: saved.industry || '',
          primaryLanguage: saved.primaryLanguage || 'en',
          guidelines: saved.guidelines || '',
          topics: Array.isArray(saved.topics) ? saved.topics : [],
          avoidTopics: Array.isArray(saved.avoidTopics) ? saved.avoidTopics : [],
          ctaDefaults: saved.ctaDefaults || '',
          updatedAt: saved.updatedAt,
        };
        setInitialData(normalized);
        setFormData(normalized);
        setSuccessMessage('Brand settings saved successfully and synchronized in database.');
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to update brand settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !formData) {
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
        />
        <div className="flex items-center justify-center py-24 text-devpilot-muted">
          <Loader2 className="w-8 h-8 animate-spin text-devpilot-purple mr-3" />
          <span className="text-sm font-medium">Loading brand settings from database...</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <PageHeader
        title="Brand Settings"
        description="Configure CodeCulture identity, brand colors, voice, guidelines, and topics."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Settings', href: '/settings/brand' },
          { label: 'Brand Settings' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isSaving}
                className="text-xs gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard Changes</span>
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !isOwnerOrAdmin || !isDirty}
              className="bg-devpilot-purple hover:bg-devpilot-purple/90 text-white text-xs gap-1.5 shadow-md shadow-purple-900/20"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Settings</span>
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Permission Warning if not Owner/Admin */}
      {!isOwnerOrAdmin && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-300">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            You are logged in as <strong>{currentUser?.role || 'VIEWER'}</strong>. Brand settings are read-only.
            Only <strong>OWNER</strong> and <strong>ADMIN</strong> roles can modify brand identity.
          </span>
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between text-xs text-red-300 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Brand Identity, Colors, Guidelines */}
        <div className="lg:col-span-2 space-y-6">
          {/* Public Brand Identity */}
          <Card className="border-devpilot-border bg-devpilot-card">
            <CardHeader>
              <CardTitle className="text-base text-devpilot-text">Public Brand Identity</CardTitle>
              <CardDescription className="text-xs text-devpilot-muted">
                Core identity of the brand managed by DevPilot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                    Brand Name <span className="text-devpilot-purple">*</span>
                  </label>
                  <Input
                    value={formData.brandName}
                    onChange={(e) => handleChange('brandName', e.target.value)}
                    disabled={!isOwnerOrAdmin || isSaving}
                    placeholder="e.g. CodeCulture"
                    className="bg-devpilot-bg/60 border-devpilot-border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                    Industry / Niche
                  </label>
                  <Input
                    value={formData.industry || ''}
                    onChange={(e) => handleChange('industry', e.target.value)}
                    disabled={!isOwnerOrAdmin || isSaving}
                    placeholder="e.g. Developer Education & Tech Media"
                    className="bg-devpilot-bg/60 border-devpilot-border"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Brand Tagline <span className="text-devpilot-purple">*</span>
                </label>
                <Input
                  value={formData.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  disabled={!isOwnerOrAdmin || isSaving}
                  placeholder="e.g. Code. Create. Build. Repeat."
                  className="bg-devpilot-bg/60 border-devpilot-border"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                    Website URL
                  </label>
                  <Input
                    value={formData.websiteUrl || ''}
                    onChange={(e) => handleChange('websiteUrl', e.target.value)}
                    disabled={!isOwnerOrAdmin || isSaving}
                    placeholder="https://codeculture.dev"
                    className="bg-devpilot-bg/60 border-devpilot-border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                    Primary Content Language
                  </label>
                  <Input
                    value={formData.primaryLanguage || 'en'}
                    onChange={(e) => handleChange('primaryLanguage', e.target.value)}
                    disabled={!isOwnerOrAdmin || isSaving}
                    placeholder="en"
                    className="bg-devpilot-bg/60 border-devpilot-border font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Brand Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  disabled={!isOwnerOrAdmin || isSaving}
                  rows={2}
                  placeholder="Comprehensive description of the brand's purpose, target value, and community."
                  className="w-full text-xs rounded-lg bg-devpilot-bg/60 border border-devpilot-border p-2.5 text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple transition-all resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Brand Colors & Visual Palette */}
          <Card className="border-devpilot-border bg-devpilot-card">
            <CardHeader>
              <CardTitle className="text-base text-devpilot-text">Brand Colors & Palette</CardTitle>
              <CardDescription className="text-xs text-devpilot-muted">
                Primary and accent colors used across content graphics, badges, and templates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary Color */}
                <div className="p-3.5 rounded-xl bg-devpilot-bg/60 border border-devpilot-border flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 border border-white/20 shadow-sm relative overflow-hidden"
                      style={{ backgroundColor: formData.primaryColor }}
                    >
                      <input
                        type="color"
                        value={formData.primaryColor}
                        onChange={(e) => handleChange('primaryColor', e.target.value)}
                        disabled={!isOwnerOrAdmin || isSaving}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-devpilot-text">Primary Accent</p>
                      <p className="text-[11px] text-devpilot-muted">Hero purple</p>
                    </div>
                  </div>
                  <Input
                    value={formData.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    disabled={!isOwnerOrAdmin || isSaving}
                    maxLength={7}
                    className="w-28 text-center font-mono text-xs uppercase bg-black/40 border-devpilot-border h-8"
                  />
                </div>

                {/* Secondary Color */}
                <div className="p-3.5 rounded-xl bg-devpilot-bg/60 border border-devpilot-border flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 border border-white/20 shadow-sm relative overflow-hidden"
                      style={{ backgroundColor: formData.secondaryColor }}
                    >
                      <input
                        type="color"
                        value={formData.secondaryColor}
                        onChange={(e) => handleChange('secondaryColor', e.target.value)}
                        disabled={!isOwnerOrAdmin || isSaving}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-devpilot-text">Secondary Accent</p>
                      <p className="text-[11px] text-devpilot-muted">Cyan highlight</p>
                    </div>
                  </div>
                  <Input
                    value={formData.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    disabled={!isOwnerOrAdmin || isSaving}
                    maxLength={7}
                    className="w-28 text-center font-mono text-xs uppercase bg-black/40 border-devpilot-border h-8"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content Guidelines & Default Call to Action */}
          <Card className="border-devpilot-border bg-devpilot-card">
            <CardHeader>
              <CardTitle className="text-base text-devpilot-text">Content Guidelines & CTAs</CardTitle>
              <CardDescription className="text-xs text-devpilot-muted">
                Rules and default calls-to-action applied to posts and drafts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Content Guidelines & Brand Safeguards
                </label>
                <textarea
                  value={formData.guidelines || ''}
                  onChange={(e) => handleChange('guidelines', e.target.value)}
                  disabled={!isOwnerOrAdmin || isSaving}
                  rows={3}
                  placeholder="e.g. Always verify code snippet syntax before posting. Maintain an encouraging and inclusive tone."
                  className="w-full text-xs rounded-lg bg-devpilot-bg/60 border border-devpilot-border p-2.5 text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Default Call to Action (CTA)
                </label>
                <Input
                  value={formData.ctaDefaults || ''}
                  onChange={(e) => handleChange('ctaDefaults', e.target.value)}
                  disabled={!isOwnerOrAdmin || isSaving}
                  placeholder="e.g. Follow @CodeCulture for daily web dev tips & tech insights!"
                  className="bg-devpilot-bg/60 border-devpilot-border"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Voice, Audience & Topics */}
        <div className="space-y-6">
          {/* Voice & Audience */}
          <Card className="border-devpilot-border bg-devpilot-card">
            <CardHeader>
              <div className="flex items-center gap-2 text-devpilot-purple mb-1">
                <Palette className="w-4 h-4" />
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">
                  Voice & Persona
                </span>
              </div>
              <CardTitle className="text-base text-devpilot-text">Voice & Audience</CardTitle>
              <CardDescription className="text-xs text-devpilot-muted">
                Brand tone and target audience demographics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Tone of Voice
                </label>
                <textarea
                  value={formData.tone}
                  onChange={(e) => handleChange('tone', e.target.value)}
                  disabled={!isOwnerOrAdmin || isSaving}
                  rows={2}
                  placeholder="e.g. Informative, modern, developer-friendly, humorous"
                  className="w-full text-xs rounded-lg bg-devpilot-bg/60 border border-devpilot-border p-2.5 text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Target Audience
                </label>
                <textarea
                  value={formData.audience}
                  onChange={(e) => handleChange('audience', e.target.value)}
                  disabled={!isOwnerOrAdmin || isSaving}
                  rows={2}
                  placeholder="e.g. Web developers, students, freelancers, AI enthusiasts"
                  className="w-full text-xs rounded-lg bg-devpilot-bg/60 border border-devpilot-border p-2.5 text-devpilot-text placeholder:text-devpilot-subtle focus:outline-none focus:border-devpilot-purple transition-all resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Focus Topics */}
          <Card className="border-devpilot-border bg-devpilot-card">
            <CardHeader>
              <div className="flex items-center gap-2 text-devpilot-cyan mb-1">
                <Sparkles className="w-4 h-4" />
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">
                  Content Pillars
                </span>
              </div>
              <CardTitle className="text-base text-devpilot-text">Content Topics</CardTitle>
              <CardDescription className="text-xs text-devpilot-muted">
                Core themes emphasized in CodeCulture content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Topics Tag List */}
              <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                {formData.topics.map((topic) => (
                  <Badge
                    key={topic}
                    variant="purple"
                    className="text-xs py-1 px-2.5 gap-1.5 items-center font-normal"
                  >
                    <span>{topic}</span>
                    {isOwnerOrAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTopic(topic)}
                        className="hover:text-red-400 focus:outline-none"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>

              {isOwnerOrAdmin && (
                <div className="flex gap-2">
                  <Input
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="Add topic (e.g. Rust)"
                    className="h-8 text-xs bg-devpilot-bg/60 border-devpilot-border"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddTopic}
                    className="h-8 px-2.5 text-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              {/* Avoid Topics */}
              <div className="pt-2 border-t border-devpilot-border/50">
                <label className="block text-xs font-medium text-devpilot-muted mb-2">
                  Avoid / Excluded Topics
                </label>
                <div className="flex flex-wrap gap-1.5 min-h-[30px] mb-2">
                  {formData.avoidTopics.map((topic) => (
                    <Badge
                      key={topic}
                      variant="outline"
                      className="text-xs py-0.5 px-2 gap-1 items-center font-normal text-devpilot-muted border-devpilot-border"
                    >
                      <span>{topic}</span>
                      {isOwnerOrAdmin && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAvoidTopic(topic)}
                          className="hover:text-red-400 focus:outline-none"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </Badge>
                  ))}
                  {formData.avoidTopics.length === 0 && (
                    <span className="text-[11px] text-devpilot-subtle italic">None configured</span>
                  )}
                </div>

                {isOwnerOrAdmin && (
                  <div className="flex gap-2">
                    <Input
                      value={newAvoidTopic}
                      onChange={(e) => setNewAvoidTopic(e.target.value)}
                      placeholder="Add excluded topic"
                      className="h-8 text-xs bg-devpilot-bg/60 border-devpilot-border"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddAvoidTopic}
                      className="h-8 px-2.5 text-xs shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
