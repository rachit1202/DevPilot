'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiRequest, API_BASE_URL } from '@/lib/api';
import { ContentType, ContentCategory, PostStatus } from '@devpilot/shared';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Eye,
  CalendarCheck,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  Image as ImageIcon,
  CalendarDays,
  ListFilter,
  Trash2,
  ArrowRight,
  FileText,
  User as UserIcon,
} from 'lucide-react';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list';

export interface CalendarEntry {
  id: string; // scheduleId
  contentPostId: string;
  scheduledAt: string;
  status: string;
  createdAt: string;
  post: {
    id: string;
    title: string;
    caption: string;
    contentType: ContentType;
    category: ContentCategory;
    status: PostStatus;
    scheduledAt: string | null;
    mediaItems?: Array<{
      id: string;
      mediaAsset: {
        id: string;
        fileName: string;
        originalName: string;
        mimeType: string;
      };
    }>;
    createdBy?: {
      id: string;
      name: string;
      role: string;
    };
    approval?: {
      id: string;
      status: string;
      comment?: string | null;
      reviewedAt?: string | null;
      reviewedBy?: {
        name: string;
        role: string;
      };
    } | null;
  };
}

export interface ApprovedPostOption {
  id: string;
  title: string;
  contentType: ContentType;
  category: ContentCategory;
  createdAt: string;
}

export default function ContentCalendarPage() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('');

  // Modals state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<CalendarEntry | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarEntry | null>(null);

  // Form inputs for scheduling
  const [approvedPosts, setApprovedPosts] = useState<ApprovedPostOption[]>([]);
  const [isLoadingApproved, setIsLoadingApproved] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string>('');
  const [scheduleDateTime, setScheduleDateTime] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate Date Ranges based on viewMode and currentDate
  const dateRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (viewMode === 'month') {
      const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
      return { start, end };
    } else if (viewMode === 'week') {
      const curr = new Date(currentDate);
      const day = curr.getDay(); // 0 is Sunday
      const diff = curr.getDate() - day; // start on Sunday
      const start = new Date(curr.setDate(diff));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else if (viewMode === 'day') {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else {
      // List view: 30 days window from start of current month
      const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year, month + 2, 0, 23, 59, 59));
      return { start, end };
    }
  }, [currentDate, viewMode]);

  // Fetch Calendar Entries
  const fetchCalendarEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.append('startDate', dateRange.start.toISOString());
    params.append('endDate', dateRange.end.toISOString());
    if (statusFilter) params.append('status', statusFilter);
    if (contentTypeFilter) params.append('contentType', contentTypeFilter);

    try {
      const res = await apiRequest<{
        success: boolean;
        data: {
          timezone: string;
          total: number;
          entries: CalendarEntry[];
        };
      }>(`/calendar?${params.toString()}`);

      if (res.success && res.data) {
        setEntries(res.data.entries || []);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to fetch calendar entries');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, statusFilter, contentTypeFilter]);

  useEffect(() => {
    fetchCalendarEntries();
  }, [fetchCalendarEntries]);

  // Fetch Approved Posts available for scheduling
  const fetchApprovedPosts = useCallback(async () => {
    setIsLoadingApproved(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        data: {
          posts: Array<{
            id: string;
            title: string;
            contentType: ContentType;
            category: ContentCategory;
            createdAt: string;
          }>;
        };
      }>('/content?status=APPROVED&limit=50');

      if (res.success && res.data) {
        setApprovedPosts(res.data.posts || []);
        if (res.data.posts.length > 0) {
          setSelectedPostId(res.data.posts[0].id);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to load approved posts:', err);
    } finally {
      setIsLoadingApproved(false);
    }
  }, []);

  // Open Schedule Modal with default date (tomorrow at 10:00 AM)
  const openScheduleModal = (presetDate?: Date) => {
    fetchApprovedPosts();
    const target = presetDate || new Date(Date.now() + 24 * 60 * 60 * 1000);
    // Format YYYY-MM-DDTHH:MM for datetime-local input
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    setScheduleDateTime(`${year}-${month}-${day}T10:00`);
    setFormError(null);
    setShowScheduleModal(true);
  };

  // Open Reschedule Modal
  const openRescheduleModal = (entry: CalendarEntry) => {
    setSelectedSchedule(entry);
    const existingDate = new Date(entry.scheduledAt);
    const year = existingDate.getFullYear();
    const month = String(existingDate.getMonth() + 1).padStart(2, '0');
    const day = String(existingDate.getDate()).padStart(2, '0');
    const hours = String(existingDate.getHours()).padStart(2, '0');
    const minutes = String(existingDate.getMinutes()).padStart(2, '0');
    setScheduleDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
    setFormError(null);
    setShowRescheduleModal(true);
  };

  // Submit Schedule
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostId) {
      setFormError('Please select an approved post to schedule.');
      return;
    }
    if (!scheduleDateTime) {
      setFormError('Please select a scheduled date and time.');
      return;
    }

    const scheduledDate = new Date(scheduleDateTime);
    if (scheduledDate.getTime() <= Date.now()) {
      setFormError('Scheduled date and time must be in the future.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiRequest('/calendar/schedule', {
        method: 'POST',
        data: {
          contentPostId: selectedPostId,
          scheduledAt: scheduledDate.toISOString(),
        },
      });

      setSuccessMessage('Content post scheduled successfully!');
      setTimeout(() => setSuccessMessage(null), 4000);
      setShowScheduleModal(false);
      fetchCalendarEntries();
    } catch (err: unknown) {
      const e = err as Error;
      setFormError(e.message || 'Failed to schedule post');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Reschedule
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchedule) return;

    const newDate = new Date(scheduleDateTime);
    if (newDate.getTime() <= Date.now()) {
      setFormError('Rescheduled date and time must be in the future.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiRequest(`/calendar/schedule/${selectedSchedule.id}`, {
        method: 'PATCH',
        data: {
          scheduledAt: newDate.toISOString(),
        },
      });

      setSuccessMessage(`Post rescheduled to ${newDate.toLocaleString()}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setShowRescheduleModal(false);
      setSelectedSchedule(null);
      if (viewingEntry && viewingEntry.id === selectedSchedule.id) {
        setViewingEntry({
          ...viewingEntry,
          scheduledAt: newDate.toISOString(),
          post: {
            ...viewingEntry.post,
            scheduledAt: newDate.toISOString(),
          },
        });
      }
      fetchCalendarEntries();
    } catch (err: unknown) {
      const e = err as Error;
      setFormError(e.message || 'Failed to reschedule post');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Cancel Schedule
  const handleCancelSchedule = async () => {
    if (!selectedSchedule) return;
    setIsSubmitting(true);

    try {
      await apiRequest(`/calendar/schedule/${selectedSchedule.id}`, {
        method: 'DELETE',
      });

      setSuccessMessage('Schedule cancelled. Post returned to APPROVED status.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setShowCancelModal(false);
      setSelectedSchedule(null);
      setViewingEntry(null);
      fetchCalendarEntries();
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to cancel schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Navigation handlers
  const handlePrevPeriod = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() - 1);
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() - 7);
    } else if (viewMode === 'day') {
      next.setDate(next.getDate() - 1);
    } else {
      next.setMonth(next.getMonth() - 1);
    }
    setCurrentDate(next);
  };

  const handleNextPeriod = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + 1);
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() + 7);
    } else if (viewMode === 'day') {
      next.setDate(next.getDate() + 1);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Period title label for header
  const periodTitle = useMemo(() => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (viewMode === 'week') {
      const s = dateRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const e = dateRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${s} – ${e}`;
    } else if (viewMode === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } else {
      return `Upcoming Slots: ${currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    }
  }, [viewMode, currentDate, dateRange]);

  // Days in month calculation for Month grid
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: Array<{ date: Date; dateStr: string; isCurrentMonth: boolean }> = [];

    // Leading days from previous month
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({ date: d, dateStr, isCurrentMonth: false });
    }

    // Days in current month
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({ date: d, dateStr, isCurrentMonth: true });
    }

    // Trailing days to fill 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({ date: d, dateStr, isCurrentMonth: false });
    }

    return days;
  }, [currentDate]);

  // Helper to map content type badge
  const formatContentType = (type: ContentType) => {
    return type.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Content Calendar"
        description="Schedule, visualize, and manage CodeCulture publishing slots with local calendar synchronization."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Content Calendar' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {/* View Switcher */}
            <div className="flex items-center border border-devpilot-border rounded-lg bg-devpilot-card p-0.5">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'month'
                    ? 'bg-devpilot-purple text-white shadow'
                    : 'text-devpilot-muted hover:text-devpilot-text'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'week'
                    ? 'bg-devpilot-purple text-white shadow'
                    : 'text-devpilot-muted hover:text-devpilot-text'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'day'
                    ? 'bg-devpilot-purple text-white shadow'
                    : 'text-devpilot-muted hover:text-devpilot-text'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-devpilot-purple text-white shadow'
                    : 'text-devpilot-muted hover:text-devpilot-text'
                }`}
              >
                List
              </button>
            </div>

            <Button
              size="sm"
              onClick={() => openScheduleModal()}
              className="bg-devpilot-purple hover:bg-devpilot-purple/90 text-white gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Post</span>
            </Button>
          </div>
        }
      />

      {/* Alert Banners */}
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-devpilot-danger/10 border border-devpilot-danger/20 text-devpilot-danger text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-devpilot-danger hover:underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {/* Calendar Controls & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-devpilot-card rounded-xl border border-devpilot-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-devpilot-border rounded-lg overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevPeriod}
              className="h-8 w-8 rounded-none hover:bg-white/5"
              title="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextPeriod}
              className="h-8 w-8 rounded-none hover:bg-white/5"
              title="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="text-xs h-8 px-2.5 font-medium border-devpilot-border hover:bg-white/5"
          >
            Today
          </Button>

          <h2 className="text-sm sm:text-base font-bold text-devpilot-text tracking-tight ml-1">
            {periodTitle}
          </h2>
        </div>

        {/* Filters and Timezone Display */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Content Type Filter */}
          <select
            value={contentTypeFilter}
            onChange={(e) => setContentTypeFilter(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
          >
            <option value="">All Formats</option>
            {Object.values(ContentType).map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* Timezone Indicator */}
          <div className="flex items-center gap-1.5 text-[11px] text-devpilot-subtle px-2.5 py-1 rounded-md bg-devpilot-bg border border-devpilot-border">
            <Clock className="w-3 h-3 text-devpilot-cyan" />
            <span>Asia/Kolkata (UTC+05:30)</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchCalendarEntries}
            className="h-8 w-8 text-devpilot-muted hover:text-devpilot-text hover:bg-white/5"
            title="Refresh calendar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Main Calendar Views */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl bg-devpilot-card border border-devpilot-border text-devpilot-muted">
          <RefreshCw className="w-8 h-8 animate-spin text-devpilot-purple mb-3" />
          <p className="text-xs">Loading CodeCulture content calendar...</p>
        </div>
      ) : entries.length === 0 && viewMode === 'list' ? (
        <EmptyState
          icon={CalendarIcon}
          title="No Scheduled Posts in this Range"
          description="You don't have any approved posts scheduled for the selected date window. Click below to schedule an approved post."
          actionLabel="Schedule Approved Post"
          onAction={() => openScheduleModal()}
        />
      ) : (
        <>
          {/* MONTH VIEW */}
          {viewMode === 'month' && (
            <div className="rounded-2xl border border-devpilot-border bg-devpilot-card overflow-hidden shadow-xl">
              {/* Day of Week Headers */}
              <div className="grid grid-cols-7 border-b border-devpilot-border text-center bg-black/40 text-[11px] font-semibold text-devpilot-subtle py-2.5">
                <span>SUN</span>
                <span>MON</span>
                <span>TUE</span>
                <span>WED</span>
                <span>THU</span>
                <span>FRI</span>
                <span>SAT</span>
              </div>

              {/* Month Days Grid */}
              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-devpilot-border">
                {monthDays.map(({ date, dateStr, isCurrentMonth }, idx) => {
                  const dayEntries = entries.filter((e) => {
                    const entryDate = new Date(e.scheduledAt).toISOString().split('T')[0];
                    return entryDate === dateStr;
                  });

                  const isToday = new Date().toISOString().split('T')[0] === dateStr;

                  return (
                    <div
                      key={idx}
                      className={`min-h-[110px] sm:min-h-[130px] p-1.5 flex flex-col justify-between transition-colors ${
                        isCurrentMonth ? 'bg-transparent' : 'bg-black/30 opacity-40'
                      } hover:bg-white/[0.02] group`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[11px] font-mono px-1.5 py-0.5 rounded-full ${
                            isToday
                              ? 'bg-devpilot-purple text-white font-bold'
                              : isCurrentMonth
                              ? 'text-devpilot-text'
                              : 'text-devpilot-muted'
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        {isCurrentMonth && (
                          <button
                            onClick={() => openScheduleModal(date)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-devpilot-muted hover:text-devpilot-purple hover:bg-white/10 transition-opacity"
                            title={`Schedule on ${dateStr}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Day Post Entries */}
                      <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px] scrollbar-none">
                        {dayEntries.map((entry) => (
                          <div
                            key={entry.id}
                            onClick={() => setViewingEntry(entry)}
                            className="cursor-pointer text-[10px] p-1.5 rounded-md bg-devpilot-bg border border-devpilot-purple/30 hover:border-devpilot-purple hover:bg-devpilot-purple/10 transition-all text-devpilot-text group/card flex items-center gap-1.5 shadow-sm"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-devpilot-cyan shrink-0" />
                            <span className="font-semibold truncate flex-1">
                              {entry.post.title}
                            </span>
                            <span className="text-[9px] text-devpilot-subtle font-mono shrink-0">
                              {new Date(entry.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* WEEK VIEW */}
          {viewMode === 'week' && (
            <div className="rounded-2xl border border-devpilot-border bg-devpilot-card overflow-hidden shadow-xl">
              <div className="grid grid-cols-7 divide-x divide-devpilot-border">
                {Array.from({ length: 7 }).map((_, idx) => {
                  const d = new Date(dateRange.start);
                  d.setDate(d.getDate() + idx);
                  const dateStr = d.toISOString().split('T')[0];
                  const isToday = new Date().toISOString().split('T')[0] === dateStr;

                  const dayEntries = entries.filter((e) => {
                    return new Date(e.scheduledAt).toISOString().split('T')[0] === dateStr;
                  });

                  return (
                    <div key={idx} className="min-h-[420px] flex flex-col">
                      {/* Week Column Header */}
                      <div className={`p-2.5 text-center border-b border-devpilot-border ${isToday ? 'bg-devpilot-purple/10' : 'bg-black/30'}`}>
                        <div className="text-[10px] font-semibold text-devpilot-muted uppercase">
                          {d.toLocaleDateString('en-US', { weekday: 'short' })}
                        </div>
                        <div className={`text-sm font-bold mt-0.5 ${isToday ? 'text-devpilot-purple' : 'text-devpilot-text'}`}>
                          {d.getDate()}
                        </div>
                      </div>

                      {/* Week Slots */}
                      <div className="p-2 flex-1 space-y-2 overflow-y-auto">
                        {dayEntries.length === 0 ? (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-[10px] text-devpilot-subtle italic">No slots</span>
                          </div>
                        ) : (
                          dayEntries.map((entry) => (
                            <div
                              key={entry.id}
                              onClick={() => setViewingEntry(entry)}
                              className="cursor-pointer p-2 rounded-xl bg-devpilot-bg border border-devpilot-border hover:border-devpilot-cyan/50 hover:bg-white/[0.02] transition-all space-y-1.5 shadow-sm group"
                            >
                              <div className="flex items-center justify-between text-[10px] text-devpilot-cyan font-mono">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(entry.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <Badge variant="cyan" className="text-[9px] px-1 py-0">
                                  {formatContentType(entry.post.contentType)}
                                </Badge>
                              </div>

                              <p className="text-xs font-semibold text-devpilot-text line-clamp-2">
                                {entry.post.title}
                              </p>

                              {entry.post.mediaItems && entry.post.mediaItems.length > 0 && (
                                <div className="aspect-video rounded bg-black/40 overflow-hidden mt-1 border border-devpilot-border/50">
                                  <img
                                    src={`${API_BASE_URL}/media/${entry.post.mediaItems[0].mediaAsset.id}/file`}
                                    alt="thumbnail"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DAY VIEW */}
          {viewMode === 'day' && (
            <div className="rounded-2xl border border-devpilot-border bg-devpilot-card p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-devpilot-border">
                <div>
                  <h3 className="text-base font-bold text-devpilot-text">
                    Daily Schedule: {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h3>
                  <p className="text-xs text-devpilot-muted mt-0.5">
                    {entries.length} publishing slot(s) scheduled for this date
                  </p>
                </div>
                <Button size="sm" onClick={() => openScheduleModal(currentDate)} className="bg-devpilot-purple text-white text-xs gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Schedule Slot</span>
                </Button>
              </div>

              {entries.length === 0 ? (
                <div className="text-center py-16">
                  <CalendarCheck className="w-10 h-10 text-devpilot-muted mx-auto mb-3 opacity-40" />
                  <p className="text-xs text-devpilot-muted">No content scheduled for this date.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-4 rounded-xl bg-devpilot-bg border border-devpilot-border space-y-3 hover:border-devpilot-purple/50 transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-devpilot-cyan font-mono font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(entry.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <Badge variant="purple" className="text-[10px]">
                            {formatContentType(entry.post.contentType)}
                          </Badge>
                        </div>

                        <h4 className="text-sm font-bold text-devpilot-text line-clamp-1">
                          {entry.post.title}
                        </h4>
                        <p className="text-xs text-devpilot-muted line-clamp-2 leading-relaxed">
                          {entry.post.caption}
                        </p>

                        {entry.post.mediaItems && entry.post.mediaItems.length > 0 && (
                          <div className="aspect-video rounded-lg overflow-hidden bg-black/40 border border-devpilot-border mt-2">
                            <img
                              src={`${API_BASE_URL}/media/${entry.post.mediaItems[0].mediaAsset.id}/file`}
                              alt="media"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-devpilot-border text-xs">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingEntry(entry)}
                          className="h-7 text-xs text-devpilot-muted hover:text-devpilot-text gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </Button>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRescheduleModal(entry)}
                            className="h-7 text-xs gap-1"
                          >
                            <span>Reschedule</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedSchedule(entry);
                              setShowCancelModal(true);
                            }}
                            className="h-7 text-xs text-devpilot-danger hover:bg-devpilot-danger/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <div className="rounded-2xl border border-devpilot-border bg-devpilot-card overflow-hidden shadow-xl">
              <div className="p-4 border-b border-devpilot-border bg-black/40 flex items-center justify-between">
                <span className="text-xs font-semibold text-devpilot-text">
                  Scheduled Publishing Queue ({entries.length} posts)
                </span>
                <span className="text-[11px] text-devpilot-subtle">Sorted chronologically</span>
              </div>

              <div className="divide-y divide-devpilot-border">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 hover:bg-white/[0.015] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      {entry.post.mediaItems && entry.post.mediaItems.length > 0 ? (
                        <div className="w-20 h-16 rounded-lg bg-black/40 border border-devpilot-border overflow-hidden shrink-0">
                          <img
                            src={`${API_BASE_URL}/media/${entry.post.mediaItems[0].mediaAsset.id}/file`}
                            alt="thumbnail"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-16 rounded-lg bg-devpilot-bg border border-devpilot-border flex items-center justify-center shrink-0 text-devpilot-subtle">
                          <FileText className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="purple" className="text-[10px]">
                            {formatContentType(entry.post.contentType)}
                          </Badge>
                          <Badge variant="cyan" className="text-[10px]">
                            {entry.post.category.replace(/_/g, ' ')}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                            {entry.status}
                          </Badge>
                        </div>

                        <h4 className="text-sm font-bold text-devpilot-text">
                          {entry.post.title}
                        </h4>
                        <p className="text-xs text-devpilot-muted line-clamp-1 max-w-2xl">
                          {entry.post.caption}
                        </p>

                        <div className="flex items-center gap-3 text-[11px] text-devpilot-subtle pt-0.5">
                          <span className="flex items-center gap-1 text-devpilot-cyan font-mono">
                            <Clock className="w-3 h-3" />
                            {new Date(entry.scheduledAt).toLocaleString()}
                          </span>
                          <span>•</span>
                          <span>Author: {entry.post.createdBy?.name || 'Owner'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingEntry(entry)}
                        className="h-8 text-xs text-devpilot-muted hover:text-devpilot-text gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRescheduleModal(entry)}
                        className="h-8 text-xs font-medium"
                      >
                        Reschedule
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedSchedule(entry);
                          setShowCancelModal(true);
                        }}
                        className="h-8 text-xs text-devpilot-danger hover:bg-devpilot-danger/10"
                        title="Cancel Schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* SCHEDULE MODAL (Schedule an Approved Post) */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative">
            <button
              onClick={() => setShowScheduleModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-center justify-center text-devpilot-purple">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-devpilot-text">Schedule Content Post</h3>
                <p className="text-xs text-devpilot-muted">Select an approved post and set local calendar slot</p>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 rounded-lg bg-devpilot-danger/10 border border-devpilot-danger/20 text-devpilot-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              {/* Approved Posts Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-devpilot-text flex items-center justify-between">
                  <span>Select Approved Post</span>
                  <span className="text-[11px] text-devpilot-subtle">
                    {approvedPosts.length} post(s) ready
                  </span>
                </label>

                {isLoadingApproved ? (
                  <div className="h-10 rounded-lg bg-devpilot-bg border border-devpilot-border flex items-center justify-center text-xs text-devpilot-muted">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
                    Loading approved posts...
                  </div>
                ) : approvedPosts.length === 0 ? (
                  <div className="p-3 rounded-lg bg-black/40 border border-devpilot-border text-xs text-devpilot-muted">
                    No approved posts available. Approve a post in Content Library first before scheduling.
                  </div>
                ) : (
                  <select
                    value={selectedPostId}
                    onChange={(e) => setSelectedPostId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                  >
                    {approvedPosts.map((post) => (
                      <option key={post.id} value={post.id}>
                        [{formatContentType(post.contentType)}] {post.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Date & Time Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-devpilot-text">
                  Scheduled Date & Time (UTC+05:30)
                </label>
                <Input
                  type="datetime-local"
                  value={scheduleDateTime}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  className="h-10 text-xs bg-devpilot-bg"
                  required
                />
                <p className="text-[11px] text-devpilot-subtle">
                  Time will be converted to UTC for database storage and synchronized in Asia/Kolkata timezone.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-devpilot-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowScheduleModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || approvedPosts.length === 0}
                  className="bg-devpilot-purple hover:bg-devpilot-purple/90 text-white min-w-[120px]"
                >
                  {isSubmitting ? 'Scheduling...' : 'Confirm Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {showRescheduleModal && selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative">
            <button
              onClick={() => {
                setShowRescheduleModal(false);
                setSelectedSchedule(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-devpilot-cyan/10 border border-devpilot-cyan/20 flex items-center justify-center text-devpilot-cyan">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-devpilot-text">Reschedule Post</h3>
                <p className="text-xs text-devpilot-muted line-clamp-1">{selectedSchedule.post.title}</p>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 rounded-lg bg-devpilot-danger/10 border border-devpilot-danger/20 text-devpilot-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-devpilot-text">
                  New Scheduled Date & Time
                </label>
                <Input
                  type="datetime-local"
                  value={scheduleDateTime}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  className="h-10 text-xs bg-devpilot-bg"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-devpilot-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowRescheduleModal(false);
                    setSelectedSchedule(null);
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-devpilot-cyan hover:bg-devpilot-cyan/90 text-black font-semibold min-w-[120px]"
                >
                  {isSubmitting ? 'Updating...' : 'Update Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL SCHEDULE CONFIRMATION MODAL */}
      {showCancelModal && selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative">
            <div className="flex items-center gap-3 mb-3 text-devpilot-danger">
              <div className="w-10 h-10 rounded-xl bg-devpilot-danger/10 border border-devpilot-danger/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-devpilot-text">Cancel Publishing Schedule</h3>
                <p className="text-xs text-devpilot-muted">Post will return to APPROVED status</p>
              </div>
            </div>

            <p className="text-xs text-devpilot-muted leading-relaxed mb-4">
              Are you sure you want to cancel the scheduled slot for <span className="font-semibold text-devpilot-text">&quot;{selectedSchedule.post.title}&quot;</span>? The post will revert to APPROVED status and will not publish.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowCancelModal(false);
                  setSelectedSchedule(null);
                }}
                disabled={isSubmitting}
              >
                Keep Scheduled
              </Button>
              <Button
                size="sm"
                onClick={handleCancelSchedule}
                disabled={isSubmitting}
                className="bg-devpilot-danger hover:bg-devpilot-danger/90 text-white min-w-[110px]"
              >
                {isSubmitting ? 'Cancelling...' : 'Confirm Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW ENTRY DETAILS MODAL */}
      {viewingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setViewingEntry(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <Badge variant="purple" className="text-xs">
                {formatContentType(viewingEntry.post.contentType)}
              </Badge>
              <Badge variant="cyan" className="text-xs">
                {viewingEntry.post.category.replace(/_/g, ' ')}
              </Badge>
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                {viewingEntry.status}
              </Badge>
            </div>

            <h2 className="text-lg font-bold text-devpilot-text mb-2">
              {viewingEntry.post.title}
            </h2>

            {/* Scheduled Slot Notice */}
            <div className="p-3 rounded-xl bg-devpilot-cyan/10 border border-devpilot-cyan/20 flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs text-devpilot-cyan">
                <Clock className="w-4 h-4" />
                <span className="font-mono font-medium">
                  {new Date(viewingEntry.scheduledAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openRescheduleModal(viewingEntry)}
                  className="h-7 text-xs"
                >
                  Reschedule
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedSchedule(viewingEntry);
                    setShowCancelModal(true);
                  }}
                  className="h-7 text-xs text-devpilot-danger hover:bg-devpilot-danger/10"
                >
                  Cancel
                </Button>
              </div>
            </div>

            {/* Post Caption */}
            <div className="p-4 rounded-xl bg-devpilot-bg border border-devpilot-border mb-4">
              <span className="text-[11px] font-semibold text-devpilot-subtle uppercase block mb-1.5">
                Caption
              </span>
              <p className="text-xs text-devpilot-text whitespace-pre-wrap leading-relaxed">
                {viewingEntry.post.caption}
              </p>
            </div>

            {/* Attached Media */}
            {viewingEntry.post.mediaItems && viewingEntry.post.mediaItems.length > 0 && (
              <div className="mb-4">
                <span className="text-xs font-semibold text-devpilot-text block mb-2">Attached Media</span>
                <div className="grid grid-cols-2 gap-2">
                  {viewingEntry.post.mediaItems.map((item) => (
                    <div key={item.id} className="aspect-video rounded-lg overflow-hidden bg-black/40 border border-devpilot-border">
                      <img
                        src={`${API_BASE_URL}/media/${item.mediaAsset.id}/file`}
                        alt={item.mediaAsset.originalName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Author and Approval Info */}
            <div className="space-y-1 pt-3 border-t border-devpilot-border text-xs text-devpilot-subtle">
              <div className="flex items-center justify-between">
                <span>Author: {viewingEntry.post.createdBy?.name || 'Owner'}</span>
                <span>Created: {new Date(viewingEntry.createdAt).toLocaleDateString()}</span>
              </div>
              {viewingEntry.post.approval && (
                <div className="flex items-center justify-between text-emerald-400">
                  <span>Approved by: {viewingEntry.post.approval.reviewedBy?.name || 'Reviewer'}</span>
                  <span>Status: VERIFIED APPROVED</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
