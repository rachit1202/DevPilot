'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api';
import {
  Globe,
  Clock,
  Calendar,
  Check,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  X,
  Info,
} from 'lucide-react';

interface ApplicationSettingsData {
  id: string;
  timezone: string;
  defaultLanguage: string;
  timeFormat: '12h' | '24h';
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  firstDayOfWeek: number;
  defaultView: 'month' | 'week' | 'day' | 'list';
  updatedAt?: string;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

const COMMON_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST — UTC+05:30)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time — UTC+00:00)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern Time — UTC-05:00 / UTC-04:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time — UTC-06:00 / UTC-05:00)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time — UTC-07:00 / UTC-06:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time — UTC-08:00 / UTC-07:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT / BST — UTC+00:00 / UTC+01:00)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET / CEST — UTC+01:00 / UTC+02:00)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (Gulf Standard Time — UTC+04:00)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (Singapore Time — UTC+08:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (Japan Standard Time — UTC+09:00)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST / AEDT — UTC+10:00 / UTC+11:00)' },
];

const LANGUAGES = [
  { value: 'en', label: 'English (en)' },
  { value: 'es', label: 'Spanish (es)' },
  { value: 'de', label: 'German (de)' },
  { value: 'fr', label: 'French (fr)' },
  { value: 'hi', label: 'Hindi (hi)' },
  { value: 'ja', label: 'Japanese (ja)' },
];

export default function ApplicationSettingsPage() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [initialData, setInitialData] = useState<ApplicationSettingsData | null>(null);
  const [formData, setFormData] = useState<ApplicationSettingsData | null>(null);
  const [customTimezone, setCustomTimezone] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isOwnerOrAdmin = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  // Fetch settings from API
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [userRes, appRes] = await Promise.all([
        apiRequest<{ success: boolean; data: { user: UserProfile } }>('/auth/me'),
        apiRequest<{ success: boolean; data: ApplicationSettingsData }>('/settings/app'),
      ]);

      if (userRes.success && userRes.data) {
        setCurrentUser(userRes.data.user);
      }

      if (appRes.success && appRes.data) {
        const app = appRes.data;
        const normalized: ApplicationSettingsData = {
          id: app.id,
          timezone: app.timezone || 'Asia/Kolkata',
          defaultLanguage: app.defaultLanguage || 'en',
          timeFormat: app.timeFormat || '12h',
          dateFormat: app.dateFormat || 'YYYY-MM-DD',
          firstDayOfWeek: app.firstDayOfWeek ?? 0,
          defaultView: app.defaultView || 'month',
          updatedAt: app.updatedAt,
        };
        setInitialData(normalized);
        setFormData(normalized);

        const isStandard = COMMON_TIMEZONES.some((tz) => tz.value === normalized.timezone);
        setCustomTimezone(!isStandard);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to load application settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Handle updates
  const handleChange = <K extends keyof ApplicationSettingsData>(field: K, value: ApplicationSettingsData[K]) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
    setSuccessMessage(null);
  };

  // Check dirty state
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

    try {
      const payload = {
        timezone: formData.timezone.trim(),
        defaultLanguage: formData.defaultLanguage.trim(),
        timeFormat: formData.timeFormat,
        dateFormat: formData.dateFormat,
        firstDayOfWeek: Number(formData.firstDayOfWeek),
        defaultView: formData.defaultView,
      };

      const res = await apiRequest<{ success: boolean; data: ApplicationSettingsData }>('/settings/app', {
        method: 'PATCH',
        data: payload,
      });

      if (res.success && res.data) {
        const saved = res.data;
        const normalized: ApplicationSettingsData = {
          id: saved.id,
          timezone: saved.timezone,
          defaultLanguage: saved.defaultLanguage,
          timeFormat: saved.timeFormat,
          dateFormat: saved.dateFormat,
          firstDayOfWeek: saved.firstDayOfWeek,
          defaultView: saved.defaultView,
          updatedAt: saved.updatedAt,
        };
        setInitialData(normalized);
        setFormData(normalized);
        setSuccessMessage('Application settings saved successfully.');
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to update application settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !formData) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Application Settings"
          description="Configure application timezone, language, and calendar display preferences."
          breadcrumbs={[
            { label: 'Overview', href: '/' },
            { label: 'Settings', href: '/settings/app' },
            { label: 'Application Settings' },
          ]}
        />
        <div className="flex items-center justify-center py-24 text-devpilot-muted">
          <Loader2 className="w-8 h-8 animate-spin text-devpilot-purple mr-3" />
          <span className="text-sm font-medium">Loading application settings from database...</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <PageHeader
        title="Application Settings"
        description="Configure application timezone, default language, time formats, and calendar defaults."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Settings', href: '/settings/app' },
          { label: 'Application Settings' },
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

      {/* Permission Warning */}
      {!isOwnerOrAdmin && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-300">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            You are logged in as <strong>{currentUser?.role || 'VIEWER'}</strong>. Application settings are read-only.
            Only <strong>OWNER</strong> and <strong>ADMIN</strong> roles can update system configuration.
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

      {/* Timezone Invariant Banner */}
      <div className="p-3.5 rounded-xl bg-devpilot-cyan/10 border border-devpilot-cyan/30 flex items-start gap-3 text-xs text-devpilot-text">
        <Info className="w-4 h-4 text-devpilot-cyan shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-devpilot-cyan">Timezone Synchronization Guarantee</p>
          <p className="text-devpilot-muted text-[11px] leading-relaxed">
            All schedule slots are persisted as UTC instants in PostgreSQL. Changing the application timezone updates
            calendar visual presentation and query date bounds without rewriting or invalidating stored schedules.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timezone & Localization */}
        <Card className="border-devpilot-border bg-devpilot-card">
          <CardHeader>
            <div className="flex items-center gap-2 text-devpilot-purple mb-1">
              <Globe className="w-4 h-4" />
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">
                Localization
              </span>
            </div>
            <CardTitle className="text-base text-devpilot-text">Timezone & Language</CardTitle>
            <CardDescription className="text-xs text-devpilot-muted">
              Configure system timezone and default language
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-devpilot-muted">
                  Application Timezone <span className="text-devpilot-purple">*</span>
                </label>
                {isOwnerOrAdmin && (
                  <button
                    type="button"
                    onClick={() => setCustomTimezone(!customTimezone)}
                    className="text-[11px] text-devpilot-cyan hover:underline"
                  >
                    {customTimezone ? 'Select from list' : 'Custom IANA Zone'}
                  </button>
                )}
              </div>

              {customTimezone ? (
                <Input
                  value={formData.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)}
                  disabled={!isOwnerOrAdmin || isSaving}
                  placeholder="e.g. Asia/Kolkata"
                  className="bg-devpilot-bg/60 border-devpilot-border font-mono text-xs"
                />
              ) : (
                <select
                  value={formData.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)}
                  disabled={!isOwnerOrAdmin || isSaving}
                  className="w-full text-xs rounded-lg bg-devpilot-bg/60 border border-devpilot-border px-3 py-2 text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value} className="bg-devpilot-card text-devpilot-text">
                      {tz.label}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-devpilot-muted mt-1">
                Current active timezone: <span className="font-mono text-devpilot-cyan">{formData.timezone}</span>
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-devpilot-muted">
                  Default Content Language
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-devpilot-subtle border border-devpilot-border">
                  Deferred Localization
                </span>
              </div>
              <select
                value={formData.defaultLanguage}
                disabled={true}
                className="w-full text-xs rounded-lg bg-devpilot-bg/30 border border-devpilot-border px-3 py-2 text-devpilot-muted cursor-not-allowed"
              >
                <option value="en">English (United States) [en]</option>
              </select>
              <p className="text-[11px] text-devpilot-subtle mt-1.5 leading-relaxed">
                DevPilot currently operates in English (en). Multi-language localization and translation engines are planned for a future milestone. Stored preference is preserved.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Calendar & Time Display Preferences */}
        <Card className="border-devpilot-border bg-devpilot-card">
          <CardHeader>
            <div className="flex items-center gap-2 text-devpilot-cyan mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">
                Calendar & Display
              </span>
            </div>
            <CardTitle className="text-base text-devpilot-text">Calendar & Time Display</CardTitle>
            <CardDescription className="text-xs text-devpilot-muted">
              Configure how calendar dates, times, and views are formatted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Time Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleChange('timeFormat', '12h')}
                    disabled={!isOwnerOrAdmin || isSaving}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                      formData.timeFormat === '12h'
                        ? 'bg-devpilot-purple/20 border-devpilot-purple text-white'
                        : 'bg-devpilot-bg/60 border-devpilot-border text-devpilot-muted hover:border-devpilot-subtle'
                    }`}
                  >
                    12-hour (10:00 AM)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChange('timeFormat', '24h')}
                    disabled={!isOwnerOrAdmin || isSaving}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                      formData.timeFormat === '24h'
                        ? 'bg-devpilot-purple/20 border-devpilot-purple text-white'
                        : 'bg-devpilot-bg/60 border-devpilot-border text-devpilot-muted hover:border-devpilot-subtle'
                    }`}
                  >
                    24-hour (10:00)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Date Format
                </label>
                <select
                  value={formData.dateFormat}
                  onChange={(e) =>
                    handleChange('dateFormat', e.target.value as 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY')
                  }
                  disabled={!isOwnerOrAdmin || isSaving}
                  className="w-full text-xs rounded-lg bg-devpilot-bg/60 border border-devpilot-border px-3 py-2 text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                >
                  <option value="YYYY-MM-DD" className="bg-devpilot-card text-devpilot-text">
                    YYYY-MM-DD (2026-11-23)
                  </option>
                  <option value="DD/MM/YYYY" className="bg-devpilot-card text-devpilot-text">
                    DD/MM/YYYY (23/11/2026)
                  </option>
                  <option value="MM/DD/YYYY" className="bg-devpilot-card text-devpilot-text">
                    MM/DD/YYYY (11/23/2026)
                  </option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  First Day of the Week
                </label>
                <select
                  value={formData.firstDayOfWeek}
                  onChange={(e) => handleChange('firstDayOfWeek', Number(e.target.value))}
                  disabled={!isOwnerOrAdmin || isSaving}
                  className="w-full text-xs rounded-lg bg-devpilot-bg/60 border border-devpilot-border px-3 py-2 text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                >
                  <option value={0} className="bg-devpilot-card text-devpilot-text">
                    Sunday
                  </option>
                  <option value={1} className="bg-devpilot-card text-devpilot-text">
                    Monday
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                  Default Calendar View
                </label>
                <select
                  value={formData.defaultView}
                  onChange={(e) =>
                    handleChange('defaultView', e.target.value as 'month' | 'week' | 'day' | 'list')
                  }
                  disabled={!isOwnerOrAdmin || isSaving}
                  className="w-full text-xs rounded-lg bg-devpilot-bg/60 border border-devpilot-border px-3 py-2 text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                >
                  <option value="month" className="bg-devpilot-card text-devpilot-text">
                    Month Grid
                  </option>
                  <option value="week" className="bg-devpilot-card text-devpilot-text">
                    Week View
                  </option>
                  <option value="day" className="bg-devpilot-card text-devpilot-text">
                    Day View
                  </option>
                  <option value="list" className="bg-devpilot-card text-devpilot-text">
                    Upcoming List
                  </option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
