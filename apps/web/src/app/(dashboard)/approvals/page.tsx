'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  User,
  Calendar,
  Tag,
  Image as ImageIcon,
  Eye,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/api';
import {
  UserRole,
  PostStatus,
  ApprovalStatus,
  ContentType,
  ContentCategory,
} from '@devpilot/shared';

interface MediaAsset {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  width?: number;
  height?: number;
}

interface ContentMediaItem {
  id: string;
  position: number;
  mediaAsset: MediaAsset;
}

interface CreatorInfo {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface ReviewerInfo {
  id: string;
  name: string;
  role: UserRole;
}

interface ApprovalRecord {
  id: string;
  status: ApprovalStatus;
  comment?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  reviewedBy?: ReviewerInfo | null;
  requestedBy?: ReviewerInfo | null;
}

interface PendingPost {
  id: string;
  title: string;
  caption: string;
  hashtags: string[];
  cta?: string | null;
  contentType: ContentType;
  category: ContentCategory;
  status: PostStatus;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: CreatorInfo;
  mediaItems: ContentMediaItem[];
  approvals: ApprovalRecord[];
}

interface HistoryItem {
  id: string;
  status: ApprovalStatus;
  comment?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  contentPost: {
    id: string;
    title: string;
    caption: string;
    hashtags: string[];
    cta?: string | null;
    contentType: ContentType;
    category: ContentCategory;
    status: PostStatus;
    scheduledAt?: string | null;
    createdAt: string;
    createdBy: CreatorInfo;
    mediaItems: ContentMediaItem[];
  };
  reviewedBy?: ReviewerInfo | null;
  requestedBy?: ReviewerInfo | null;
}

interface ApprovalStats {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalPosts: number;
}

export default function ApprovalCenterPage() {
  const { user } = useAuth();

  // Reviewer permission: Only OWNER, ADMIN, APPROVER can approve or reject
  const isReviewer =
    user?.role === UserRole.OWNER ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.APPROVER;

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  // Stats
  const [stats, setStats] = useState<ApprovalStats>({
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    totalPosts: 0,
  });

  // Pending Approvals State
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingTotalPages, setPendingTotalPages] = useState(1);

  // History State
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');

  // Filters
  const [search, setSearch] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [inspectingPost, setInspectingPost] = useState<PendingPost | null>(null);
  const [rejectionModalPost, setRejectionModalPost] = useState<PendingPost | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');

  // Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await apiRequest<{ success: boolean; data: { stats: ApprovalStats } }>('/approvals/stats');
      if (res.success && res.data?.stats) {
        setStats(res.data.stats);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  // Fetch Pending Posts
  const fetchPending = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', String(pendingPage));
      params.append('limit', '10');
      if (search) params.append('search', search);
      if (contentTypeFilter) params.append('contentType', contentTypeFilter);
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await apiRequest<{
        success: boolean;
        data: {
          posts: PendingPost[];
          pagination: { total: number; page: number; limit: number; totalPages: number };
        };
      }>(`/approvals/pending?${params.toString()}`);

      if (res.success && res.data) {
        setPendingPosts(res.data.posts || []);
        setPendingTotal(res.data.pagination.total);
        setPendingTotalPages(res.data.pagination.totalPages);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to fetch pending approvals');
    } finally {
      setIsLoading(false);
    }
  }, [pendingPage, search, contentTypeFilter, categoryFilter]);

  // Fetch History
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', String(historyPage));
      params.append('limit', '10');
      if (historyStatusFilter !== 'ALL') params.append('status', historyStatusFilter);
      if (search) params.append('search', search);
      if (contentTypeFilter) params.append('contentType', contentTypeFilter);
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await apiRequest<{
        success: boolean;
        data: {
          history: HistoryItem[];
          pagination: { total: number; page: number; limit: number; totalPages: number };
        };
      }>(`/approvals/history?${params.toString()}`);

      if (res.success && res.data) {
        setHistoryItems(res.data.history || []);
        setHistoryTotal(res.data.pagination.total);
        setHistoryTotalPages(res.data.pagination.totalPages);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to fetch approval history');
    } finally {
      setIsLoading(false);
    }
  }, [historyPage, historyStatusFilter, search, contentTypeFilter, categoryFilter]);

  // Initial and reactive load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPending();
    } else {
      fetchHistory();
    }
  }, [activeTab, fetchPending, fetchHistory]);

  const refreshAll = () => {
    fetchStats();
    if (activeTab === 'pending') {
      fetchPending();
    } else {
      fetchHistory();
    }
  };

  // Approve Action
  const handleApprove = async (postId: string, comment?: string) => {
    if (!isReviewer) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/approvals/${postId}/approve`, {
        method: 'POST',
        data: { comment: comment || undefined },
      });

      setSuccessMessage('Content post approved successfully! Post is now eligible for scheduling.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setInspectingPost(null);
      setApprovalComment('');
      refreshAll();
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to approve content post');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reject Action
  const handleReject = async (postId: string, comment: string) => {
    if (!isReviewer) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/approvals/${postId}/reject`, {
        method: 'POST',
        data: { comment: comment || undefined },
      });

      setSuccessMessage('Content post rejected.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setRejectionModalPost(null);
      setInspectingPost(null);
      setRejectionReason('');
      refreshAll();
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to reject content post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatContentType = (type: ContentType) => type.replace(/_/g, ' ');
  const formatCategory = (cat: ContentCategory) => cat.replace(/_/g, ' ');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Approval Center"
        description="The strict human-in-the-loop review station. Zero public publishing happens without explicit sign-off."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Approval Center' },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        }
      />

      {/* Philosophy & Role Callout Banner */}
      <div className="p-4 rounded-xl bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-start justify-between gap-4 text-xs text-purple-200">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-devpilot-purple shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-white">Strict Human Gate Active</p>
            <p className="mt-0.5 text-devpilot-muted">
              CodeCulture posts submitted for review must be vetted by an Owner, Admin, or Approver before entering any scheduling or publishing queue.
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-devpilot-bg border border-devpilot-border text-devpilot-text">
            Role: <strong className="text-devpilot-purple">{user?.role || 'VIEWER'}</strong>
          </span>
          <p className="text-[10px] text-devpilot-muted mt-1">
            {isReviewer ? 'Review & Decision Privileges Granted' : 'Read-Only Observation Access'}
          </p>
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-devpilot-danger/10 border border-devpilot-danger/20 text-devpilot-danger text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-devpilot-danger hover:underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-devpilot-muted">Awaiting Review</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-devpilot-text mt-2">{stats.pendingCount}</div>
          <p className="text-[11px] text-amber-400/80 mt-1">In review queue</p>
        </div>

        <div className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-devpilot-muted">Total Approved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-devpilot-text mt-2">{stats.approvedCount}</div>
          <p className="text-[11px] text-emerald-400/80 mt-1">Ready for schedule</p>
        </div>

        <div className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-devpilot-muted">Total Rejected</span>
            <XCircle className="w-4 h-4 text-devpilot-danger" />
          </div>
          <div className="text-2xl font-bold text-devpilot-text mt-2">{stats.rejectedCount}</div>
          <p className="text-[11px] text-devpilot-danger/80 mt-1">Returned with feedback</p>
        </div>

        <div className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-devpilot-muted">Total Posts</span>
            <FileText className="w-4 h-4 text-devpilot-purple" />
          </div>
          <div className="text-2xl font-bold text-devpilot-text mt-2">{stats.totalPosts}</div>
          <p className="text-[11px] text-devpilot-subtle mt-1">Total in repository</p>
        </div>
      </div>

      {/* Tabs & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-devpilot-card rounded-xl border border-devpilot-border shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center border border-devpilot-border rounded-lg bg-devpilot-bg p-1">
          <button
            onClick={() => {
              setActiveTab('pending');
              setSearch('');
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'pending'
                ? 'bg-devpilot-purple text-white shadow'
                : 'text-devpilot-muted hover:text-devpilot-text'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Approvals</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
              {stats.pendingCount}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              setSearch('');
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'history'
                ? 'bg-devpilot-purple text-white shadow'
                : 'text-devpilot-muted hover:text-devpilot-text'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Approval History</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
              {stats.approvedCount + stats.rejectedCount}
            </span>
          </button>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* History status filter */}
          {activeTab === 'history' && (
            <select
              value={historyStatusFilter}
              onChange={(e) => {
                setHistoryStatusFilter(e.target.value as 'ALL' | 'APPROVED' | 'REJECTED');
                setHistoryPage(1);
              }}
              className="h-8 px-2.5 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
            >
              <option value="ALL">All Decisions</option>
              <option value="APPROVED">Approved Only</option>
              <option value="REJECTED">Rejected Only</option>
            </select>
          )}

          {/* Content Type Filter */}
          <select
            value={contentTypeFilter}
            onChange={(e) => {
              setContentTypeFilter(e.target.value);
              setPendingPage(1);
              setHistoryPage(1);
            }}
            className="h-8 px-2.5 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
          >
            <option value="">All Formats</option>
            {Object.values(ContentType).map((type) => (
              <option key={type} value={type}>
                {formatContentType(type)}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPendingPage(1);
              setHistoryPage(1);
            }}
            className="h-8 px-2.5 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
          >
            <option value="">All Categories</option>
            {Object.values(ContentCategory).map((cat) => (
              <option key={cat} value={cat}>
                {formatCategory(cat)}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-devpilot-muted" />
            <Input
              type="text"
              placeholder="Search submissions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-devpilot-bg border-devpilot-border"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-12 text-center rounded-xl bg-devpilot-card border border-devpilot-border">
          <RefreshCw className="w-6 h-6 animate-spin text-devpilot-purple mx-auto mb-2" />
          <p className="text-xs text-devpilot-muted">Loading submissions and approval data...</p>
        </div>
      ) : activeTab === 'pending' ? (
        // Pending Approvals Tab View
        pendingPosts.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No Content Awaiting Approval"
            description={
              search || contentTypeFilter || categoryFilter
                ? 'No pending submissions match your active filter criteria. Try clearing filters.'
                : 'All submissions have been reviewed. When drafts are submitted for approval, they will appear here with full inspection and decision controls.'
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {pendingPosts.map((post) => (
                <div
                  key={post.id}
                  className="p-5 rounded-xl bg-devpilot-card border border-devpilot-border hover:border-devpilot-purple/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Content Information */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    {/* Media Thumbnail or Type Icon */}
                    <div className="w-16 h-16 rounded-lg bg-devpilot-bg border border-devpilot-border flex items-center justify-center shrink-0 overflow-hidden relative">
                      {post.mediaItems && post.mediaItems.length > 0 ? (
                        <img
                          src={`http://localhost:4000/api/v1/media/stream/${post.mediaItems[0].mediaAsset.id}`}
                          alt={post.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <FileText className="w-6 h-6 text-devpilot-purple/70" />
                      )}
                      <span className="absolute bottom-1 right-1 px-1 rounded text-[9px] font-mono bg-black/70 text-devpilot-subtle">
                        {post.mediaItems.length}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="warning" className="text-[10px] font-mono">
                          IN REVIEW
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {formatContentType(post.contentType)}
                        </Badge>
                        <span className="text-[11px] text-devpilot-muted font-medium">
                          {formatCategory(post.category)}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-devpilot-text truncate mb-1">
                        {post.title}
                      </h3>

                      <p className="text-xs text-devpilot-muted line-clamp-2 mb-2">
                        {post.caption}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-devpilot-subtle flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{post.createdBy.name} ({post.createdBy.role})</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Submitted {new Date(post.createdAt).toLocaleDateString()}</span>
                        </span>
                        {post.scheduledAt && (
                          <span className="flex items-center gap-1 text-devpilot-cyan">
                            <Clock className="w-3 h-3" />
                            <span>Slot: {new Date(post.scheduledAt).toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setInspectingPost(post)}
                      className="text-xs h-8 gap-1 border-devpilot-border"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </Button>

                    {isReviewer ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(post.id)}
                          disabled={isSubmitting}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRejectionModalPost(post);
                            setRejectionReason('');
                          }}
                          disabled={isSubmitting}
                          className="border-devpilot-danger/30 text-devpilot-danger hover:bg-devpilot-danger/10 text-xs h-8 gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </Button>
                      </>
                    ) : (
                      <span className="text-[11px] text-devpilot-subtle italic px-2">
                        Review requires Approver role
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pendingTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 bg-devpilot-card rounded-xl border border-devpilot-border text-xs text-devpilot-muted">
                <span>
                  Showing page {pendingPage} of {pendingTotalPages} ({pendingTotal} pending post(s))
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                    disabled={pendingPage <= 1}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingPage((p) => Math.min(pendingTotalPages, p + 1))}
                    disabled={pendingPage >= pendingTotalPages}
                    className="h-7 px-2 text-xs"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        // Approval History Tab View
        historyItems.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No Approval History Records"
            description="No past approval or rejection records were found. Approved or rejected content decisions will appear here with reviewer audit trails."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {historyItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        variant={item.status === ApprovalStatus.APPROVED ? 'success' : 'danger'}
                        className="text-[10px] font-mono"
                      >
                        {item.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {formatContentType(item.contentPost.contentType)}
                      </Badge>
                      <span className="text-[11px] text-devpilot-muted">
                        {formatCategory(item.contentPost.category)}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-devpilot-text truncate mb-1">
                      {item.contentPost.title}
                    </h4>

                    {item.comment && (
                      <div className="p-2.5 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-muted mb-2 flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-devpilot-purple shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-devpilot-text">Decision Note: </span>
                          <span>{item.comment}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-devpilot-subtle flex-wrap">
                      <span>
                        Decided by <strong>{item.reviewedBy?.name || 'Reviewer'}</strong> ({item.reviewedBy?.role || 'APPROVER'})
                      </span>
                      <span>•</span>
                      <span>
                        {item.reviewedAt
                          ? new Date(item.reviewedAt).toLocaleString()
                          : new Date(item.createdAt).toLocaleString()}
                      </span>
                      <span>•</span>
                      <span>Author: {item.contentPost.createdBy.name}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setInspectingPost({
                        ...item.contentPost,
                        approvals: [item],
                        updatedAt: item.contentPost.createdAt,
                      })
                    }
                    className="text-xs h-8 gap-1 shrink-0 self-end md:self-center border-devpilot-border"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect Post</span>
                  </Button>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 bg-devpilot-card rounded-xl border border-devpilot-border text-xs text-devpilot-muted">
                <span>
                  Showing page {historyPage} of {historyTotalPages} ({historyTotal} history records)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage <= 1}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPage >= historyTotalPages}
                    className="h-7 px-2 text-xs"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Inspect & Review Modal */}
      {inspectingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] bg-devpilot-card border border-devpilot-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-devpilot-border flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Badge variant={inspectingPost.status === PostStatus.APPROVED ? 'success' : inspectingPost.status === PostStatus.IN_REVIEW ? 'warning' : 'outline'} className="text-[10px]">
                    {inspectingPost.status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {formatContentType(inspectingPost.contentType)}
                  </Badge>
                  <span className="text-xs text-devpilot-muted">
                    {formatCategory(inspectingPost.category)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-devpilot-text">
                  {inspectingPost.title}
                </h3>
              </div>
              <button
                onClick={() => setInspectingPost(null)}
                className="text-devpilot-muted hover:text-devpilot-text p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Media Preview if attached */}
              {inspectingPost.mediaItems && inspectingPost.mediaItems.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-devpilot-text flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-devpilot-purple" />
                    <span>Attached Media Assets ({inspectingPost.mediaItems.length})</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {inspectingPost.mediaItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-devpilot-border bg-devpilot-bg p-2 space-y-1.5"
                      >
                        <div className="h-28 rounded bg-black/40 overflow-hidden flex items-center justify-center">
                          <img
                            src={`http://localhost:4000/api/v1/media/stream/${item.mediaAsset.id}`}
                            alt={item.mediaAsset.originalName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-[11px] font-medium text-devpilot-text truncate">
                          {item.mediaAsset.originalName}
                        </p>
                        <p className="text-[10px] text-devpilot-subtle">
                          {(item.mediaAsset.fileSize / 1024).toFixed(1)} KB • {item.mediaAsset.mimeType}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Caption */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-devpilot-text">Post Caption</label>
                <div className="p-3.5 rounded-lg bg-devpilot-bg border border-devpilot-border text-devpilot-text whitespace-pre-wrap leading-relaxed font-sans">
                  {inspectingPost.caption}
                </div>
              </div>

              {/* Hashtags */}
              {inspectingPost.hashtags && inspectingPost.hashtags.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text flex items-center gap-1">
                    <Tag className="w-3 h-3 text-devpilot-cyan" />
                    <span>Hashtags</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectingPost.hashtags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded bg-devpilot-cyan/10 border border-devpilot-cyan/20 text-devpilot-cyan text-[11px] font-mono">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Author & Submission Info */}
              <div className="p-3 rounded-lg bg-devpilot-bg/50 border border-devpilot-border grid grid-cols-2 gap-2 text-[11px] text-devpilot-muted">
                <div>
                  <span className="text-devpilot-subtle">Author:</span> {inspectingPost.createdBy.name} ({inspectingPost.createdBy.role})
                </div>
                <div>
                  <span className="text-devpilot-subtle">Submitted:</span> {new Date(inspectingPost.createdAt).toLocaleString()}
                </div>
                {inspectingPost.scheduledAt && (
                  <div className="col-span-2 text-devpilot-cyan">
                    <span className="text-devpilot-subtle">Requested Schedule:</span> {new Date(inspectingPost.scheduledAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Reviewer Decisions Box if in review */}
              {isReviewer && inspectingPost.status === PostStatus.IN_REVIEW && (
                <div className="p-3.5 rounded-xl bg-devpilot-purple/5 border border-devpilot-purple/20 space-y-2">
                  <label className="text-xs font-semibold text-devpilot-text flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-devpilot-purple" />
                    <span>Approval Comment (Optional)</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Approved for CodeCulture developer tip series"
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    className="text-xs bg-devpilot-bg border-devpilot-border"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-devpilot-border bg-devpilot-bg/40 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectingPost(null)}
                className="text-xs border-devpilot-border"
              >
                Close
              </Button>

              {isReviewer && inspectingPost.status === PostStatus.IN_REVIEW ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectionModalPost(inspectingPost);
                      setRejectionReason('');
                    }}
                    disabled={isSubmitting}
                    className="border-devpilot-danger/30 text-devpilot-danger hover:bg-devpilot-danger/10 text-xs gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject Post</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(inspectingPost.id, approvalComment)}
                    disabled={isSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve Post</span>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Rejection Modal */}
      {rejectionModalPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-devpilot-card border border-devpilot-border rounded-2xl shadow-2xl overflow-hidden p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-devpilot-danger">
              <XCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-devpilot-text">Reject Content Post</h3>
            </div>

            <p className="text-xs text-devpilot-muted">
              Rejecting <strong className="text-devpilot-text">"{rejectionModalPost.title}"</strong> will notify the creator and record the rejection in the audit trail.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-devpilot-text">
                Reason for Rejection / Changes Needed
              </label>
              <textarea
                rows={4}
                placeholder="Explain why this content was rejected and what adjustments the author should make..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full p-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-danger resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectionModalPost(null)}
                disabled={isSubmitting}
                className="text-xs border-devpilot-border"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleReject(rejectionModalPost.id, rejectionReason)}
                disabled={isSubmitting}
                className="bg-devpilot-danger hover:bg-devpilot-danger/90 text-white text-xs gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
