'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiRequest, API_BASE_URL } from '@/lib/api';
import { ContentType, ContentCategory, PostStatus } from '@devpilot/shared';
import {
  FolderKanban,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit3,
  Eye,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  Calendar,
  Tag,
  X,
  FileText,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface ContentPost {
  id: string;
  title: string;
  caption: string;
  hashtags: string[];
  cta?: string | null;
  contentType: ContentType;
  category: ContentCategory;
  status: PostStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  mediaItems: Array<{
    id: string;
    position: number;
    mediaAsset: {
      id: string;
      fileName: string;
      originalName: string;
      mimeType: string;
      fileSize: number;
    };
  }>;
}

interface MediaAsset {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export default function ContentLibraryPage() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Pagination State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPosts, setTotalPosts] = useState(0);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPost, setEditingPost] = useState<ContentPost | null>(null);
  const [viewingPost, setViewingPost] = useState<ContentPost | null>(null);
  const [postToDelete, setPostToDelete] = useState<ContentPost | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formCaption, setFormCaption] = useState('');
  const [formHashtags, setFormHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [formContentType, setFormContentType] = useState<ContentType>(ContentType.SINGLE_IMAGE);
  const [formCategory, setFormCategory] = useState<ContentCategory>(ContentCategory.WEB_DEV_TIPS);
  const [formStatus, setFormStatus] = useState<PostStatus>(PostStatus.DRAFT);
  const [formCta, setFormCta] = useState('');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);

  // Media Picker state
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [availableMedia, setAvailableMedia] = useState<MediaAsset[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (search.trim()) params.append('search', search.trim());
    if (statusFilter) params.append('status', statusFilter);
    if (contentTypeFilter) params.append('contentType', contentTypeFilter);
    if (categoryFilter) params.append('category', categoryFilter);
    params.append('page', String(page));
    params.append('limit', '8');

    try {
      const res = await apiRequest<{
        success: boolean;
        data: {
          posts: ContentPost[];
          pagination: { total: number; page: number; limit: number; totalPages: number };
        };
      }>(`/content?${params.toString()}`);

      if (res.success && res.data) {
        setPosts(res.data.posts || []);
        setTotalPages(res.data.pagination.totalPages || 1);
        setTotalPosts(res.data.pagination.total || 0);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to fetch content library');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, contentTypeFilter, categoryFilter, page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const fetchAvailableMedia = async () => {
    setIsLoadingMedia(true);
    try {
      const res = await apiRequest<{ success: boolean; data: { assets: MediaAsset[] } }>('/media?limit=50');
      if (res.success && res.data) {
        setAvailableMedia(res.data.assets || []);
      }
    } catch (err) {
      console.warn('Failed to fetch media assets for picker:', err);
    } finally {
      setIsLoadingMedia(false);
    }
  };

  const openCreateModal = () => {
    setEditingPost(null);
    setFormTitle('');
    setFormCaption('');
    setFormHashtags(['#codeculture', '#programming']);
    setHashtagInput('');
    setFormContentType(ContentType.SINGLE_IMAGE);
    setFormCategory(ContentCategory.WEB_DEV_TIPS);
    setFormStatus(PostStatus.DRAFT);
    setFormCta('Code. Create. Build. Repeat.');
    setSelectedMediaIds([]);
    setFormError(null);
    setShowCreateModal(true);
  };

  const openEditModal = (post: ContentPost) => {
    setEditingPost(post);
    setFormTitle(post.title);
    setFormCaption(post.caption);
    setFormHashtags(post.hashtags || []);
    setHashtagInput('');
    setFormContentType(post.contentType);
    setFormCategory(post.category);
    setFormStatus(post.status);
    setFormCta(post.cta || '');
    setSelectedMediaIds(post.mediaItems.map((m) => m.mediaAsset.id));
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleAddHashtag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      let tag = hashtagInput.trim();
      if (!tag) return;
      if (!tag.startsWith('#')) tag = `#${tag}`;
      if (!formHashtags.includes(tag) && formHashtags.length < 30) {
        setFormHashtags([...formHashtags, tag]);
      }
      setHashtagInput('');
    }
  };

  const handleRemoveHashtag = (tagToRemove: string) => {
    setFormHashtags(formHashtags.filter((t) => t !== tagToRemove));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || formTitle.trim().length < 3) {
      setFormError('Title must be at least 3 characters.');
      return;
    }
    if (!formCaption.trim() || formCaption.trim().length < 5) {
      setFormError('Caption must be at least 5 characters.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const payload: Record<string, unknown> = {
      title: formTitle.trim(),
      caption: formCaption.trim(),
      hashtags: formHashtags,
      cta: formCta.trim() || null,
      contentType: formContentType,
      category: formCategory,
      mediaAssetIds: selectedMediaIds,
    };

    // Ordinary edits cannot directly set status to APPROVED, SCHEDULED, or PUBLISHED
    if (
      formStatus &&
      formStatus !== PostStatus.APPROVED &&
      formStatus !== PostStatus.SCHEDULED &&
      formStatus !== PostStatus.PUBLISHED
    ) {
      payload.status = formStatus;
    }

    try {
      if (editingPost) {
        await apiRequest(`/content/${editingPost.id}`, {
          method: 'PATCH',
          data: payload,
        });
        setSuccessMessage(`Post "${formTitle}" updated successfully.`);
      } else {
        await apiRequest('/content', {
          method: 'POST',
          data: payload,
        });
        setSuccessMessage(`Post "${formTitle}" created in Content Library.`);
      }

      setTimeout(() => setSuccessMessage(null), 4000);
      setShowCreateModal(false);
      await fetchPosts();
    } catch (err: unknown) {
      const e = err as Error;
      setFormError(e.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = async () => {
    if (!postToDelete) return;
    setIsSubmitting(true);
    try {
      await apiRequest(`/content/${postToDelete.id}`, {
        method: 'DELETE',
      });
      setSuccessMessage(`Post "${postToDelete.title}" deleted.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setPostToDelete(null);
      await fetchPosts();
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to delete post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadgeVariant = (status: PostStatus): 'success' | 'default' | 'outline' | 'danger' | 'purple' | 'cyan' | 'warning' => {
    switch (status) {
      case PostStatus.APPROVED:
        return 'success';
      case PostStatus.PUBLISHED:
        return 'purple';
      case PostStatus.SCHEDULED:
        return 'cyan';
      case PostStatus.IN_REVIEW:
        return 'warning';
      case PostStatus.REJECTED:
      case PostStatus.FAILED:
        return 'danger';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Library"
        description="Create, edit, search, and manage multi-format CodeCulture posts with attached media assets."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Content Library' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchPosts} disabled={isLoading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={openCreateModal} className="gap-1.5 bg-devpilot-purple hover:bg-devpilot-purple/90 text-white">
              <Plus className="w-4 h-4" />
              <span>Create Post</span>
            </Button>
          </div>
        }
      />

      {/* Global Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-400 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-devpilot-danger/10 border border-devpilot-danger/20 flex items-center gap-2.5 text-xs text-devpilot-danger animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3.5 bg-devpilot-card rounded-xl border border-devpilot-border">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-devpilot-subtle" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, caption, or keywords..."
            className="pl-9 h-9 text-xs bg-black/20"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
          >
            <option value="">Status: All</option>
            {Object.values(PostStatus).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Content Type Filter */}
          <select
            value={contentTypeFilter}
            onChange={(e) => {
              setContentTypeFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
          >
            <option value="">Type: All</option>
            {Object.values(ContentType).map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>

          {/* Reset Filters */}
          {(search || statusFilter || contentTypeFilter || categoryFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setContentTypeFilter('');
                setCategoryFilter('');
                setPage(1);
              }}
              className="text-xs text-devpilot-muted hover:text-devpilot-text"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Content Posts List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-devpilot-card border border-devpilot-border animate-pulse p-4" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No Content Posts Found"
          description={
            search || statusFilter || contentTypeFilter
              ? 'No posts match your current search or filter criteria. Try resetting filters.'
              : 'Your CodeCulture content library is empty. Click below to draft your first post.'
          }
          actionLabel="Create First Post"
          onAction={openCreateModal}
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border hover:border-devpilot-borderHover transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              {/* Left Column: Media Thumbnail & Title & Meta */}
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                {/* Media Thumbnail or Placeholder */}
                <div className="w-16 h-16 rounded-lg bg-black/40 border border-devpilot-border overflow-hidden shrink-0 flex items-center justify-center relative">
                  {post.mediaItems && post.mediaItems.length > 0 ? (
                    <img
                      src={`${API_BASE_URL}/media/${post.mediaItems[0].mediaAsset.id}/file`}
                      alt={post.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="w-6 h-6 text-devpilot-subtle" />
                  )}
                  {post.mediaItems && post.mediaItems.length > 1 && (
                    <span className="absolute bottom-1 right-1 px-1 rounded text-[9px] font-bold bg-black/80 text-white">
                      +{post.mediaItems.length - 1}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-devpilot-text truncate max-w-md">{post.title}</h3>
                    <Badge variant={getStatusBadgeVariant(post.status)} className="text-[10px]">
                      {post.status}
                    </Badge>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-devpilot-purple/10 text-devpilot-purple border border-devpilot-purple/20 font-medium">
                      {post.contentType.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-xs text-devpilot-muted line-clamp-1 mb-2">{post.caption}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-devpilot-subtle">
                    {post.hashtags && post.hashtags.length > 0 && (
                      <span className="flex items-center gap-1 text-devpilot-cyan">
                        <Tag className="w-3 h-3" />
                        <span>{post.hashtags.slice(0, 3).join(' ')}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{post.createdBy?.name || 'Admin'}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setViewingPost(post)} title="View Full Post">
                  <Eye className="w-4 h-4 text-devpilot-muted hover:text-devpilot-text" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEditModal(post)} title="Edit Post">
                  <Edit3 className="w-4 h-4 text-devpilot-muted hover:text-devpilot-purple" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPostToDelete(post)} title="Delete Post">
                  <Trash2 className="w-4 h-4 text-devpilot-muted hover:text-devpilot-danger" />
                </Button>
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 px-2 text-xs text-devpilot-muted">
              <span>Showing {posts.length} of {totalPosts} posts</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </Button>
                <span className="px-2 font-medium text-devpilot-text">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Post Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-devpilot-border">
              <div className="w-9 h-9 rounded-xl bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-center justify-center text-devpilot-purple">
                <FolderKanban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-devpilot-text">
                  {editingPost ? 'Edit Content Post' : 'Create New CodeCulture Post'}
                </h3>
                <p className="text-xs text-devpilot-muted">Draft content, specify hashtags, and attach media assets</p>
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-devpilot-danger/10 border border-devpilot-danger/20 flex items-start gap-2 text-xs text-devpilot-danger">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Title Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-devpilot-text">Post Title *</label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. 5 Clean Code Rules for React Developers"
                  className="h-9 text-xs"
                  required
                />
              </div>

              {/* Caption Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-devpilot-text">Caption & Body *</label>
                <textarea
                  value={formCaption}
                  onChange={(e) => setFormCaption(e.target.value)}
                  placeholder="Write the full post caption, explanations, code snippets, or takeaways..."
                  rows={4}
                  className="w-full rounded-lg bg-devpilot-bg border border-devpilot-border p-3 text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple resize-y"
                  required
                />
              </div>

              {/* Type, Category & Status selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">Content Type</label>
                  <select
                    value={formContentType}
                    onChange={(e) => setFormContentType(e.target.value as ContentType)}
                    className="w-full h-9 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                  >
                    {Object.values(ContentType).map((t) => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ContentCategory)}
                    className="w-full h-9 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                  >
                    {Object.values(ContentCategory).map((c) => (
                      <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-devpilot-text">Post Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as PostStatus)}
                    className="w-full h-9 px-3 rounded-lg bg-devpilot-bg border border-devpilot-border text-xs text-devpilot-text focus:outline-none focus:border-devpilot-purple"
                  >
                    {Object.values(PostStatus).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hashtag Tag Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-devpilot-text">Hashtags (press Enter or comma)</label>
                <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-devpilot-bg border border-devpilot-border min-h-[42px]">
                  {formHashtags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-devpilot-cyan/10 border border-devpilot-cyan/20 text-devpilot-cyan text-[11px] font-mono"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveHashtag(tag)}
                        className="hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyDown={handleAddHashtag}
                    placeholder={formHashtags.length === 0 ? "Type #hashtag and press Enter..." : "Add more..."}
                    className="flex-1 bg-transparent text-xs text-devpilot-text focus:outline-none min-w-[120px]"
                  />
                </div>
              </div>

              {/* Call to Action (CTA) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-devpilot-text">Call To Action (CTA)</label>
                <Input
                  value={formCta}
                  onChange={(e) => setFormCta(e.target.value)}
                  placeholder="e.g. Drop your thoughts below! | Link in bio"
                  className="h-9 text-xs"
                />
              </div>

              {/* Media Asset Attachment Section */}
              <div className="space-y-2 pt-2 border-t border-devpilot-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-devpilot-text flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-devpilot-purple" />
                    <span>Attached Media Assets ({selectedMediaIds.length}/10)</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      fetchAvailableMedia();
                      setShowMediaPicker(true);
                    }}
                    className="text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Attach Media</span>
                  </Button>
                </div>

                {selectedMediaIds.length > 0 ? (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {selectedMediaIds.map((id) => (
                      <div key={id} className="relative aspect-square rounded-lg bg-black/40 border border-devpilot-border overflow-hidden group">
                        <img
                          src={`${API_BASE_URL}/media/${id}/file`}
                          alt="Attached media"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedMediaIds(selectedMediaIds.filter((mid) => mid !== id))}
                          className="absolute top-1 right-1 p-1 rounded bg-black/80 text-devpilot-danger hover:bg-devpilot-danger hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-devpilot-muted">No media attached. Click &quot;Attach Media&quot; to pick from your uploaded assets.</p>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-devpilot-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="bg-devpilot-purple hover:bg-devpilot-purple/90 text-white min-w-[120px]">
                  {isSubmitting ? 'Saving...' : editingPost ? 'Save Changes' : 'Create Post'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Media Picker Modal */}
      {showMediaPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative max-h-[80vh] flex flex-col">
            <button
              onClick={() => setShowMediaPicker(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-devpilot-text mb-1">Select Media Assets</h3>
            <p className="text-xs text-devpilot-muted mb-4">Click any asset to toggle attachment to this post</p>

            <div className="flex-1 overflow-y-auto min-h-[250px] p-1">
              {isLoadingMedia ? (
                <div className="flex items-center justify-center h-40 text-xs text-devpilot-muted">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  Loading Media Library...
                </div>
              ) : availableMedia.length === 0 ? (
                <div className="text-center py-12 text-xs text-devpilot-muted">
                  No media assets found. Please upload images in the Media Library first.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {availableMedia.map((asset) => {
                    const isSelected = selectedMediaIds.includes(asset.id);
                    return (
                      <div
                        key={asset.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedMediaIds(selectedMediaIds.filter((id) => id !== asset.id));
                          } else {
                            if (selectedMediaIds.length < 10) {
                              setSelectedMediaIds([...selectedMediaIds, asset.id]);
                            }
                          }
                        }}
                        className={`aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all relative ${isSelected
                          ? 'border-devpilot-purple ring-2 ring-devpilot-purple/30 scale-95'
                          : 'border-devpilot-border hover:border-devpilot-borderHover'
                          }`}
                      >
                        <img
                          src={`${API_BASE_URL}/media/${asset.id}/file`}
                          alt={asset.originalName}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-devpilot-purple/20 flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-white drop-shadow" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-devpilot-border">
              <span className="text-xs text-devpilot-muted">{selectedMediaIds.length} asset(s) attached</span>
              <Button size="sm" onClick={() => setShowMediaPicker(false)} className="bg-devpilot-purple text-white">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View Post Modal */}
      {viewingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewingPost(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <Badge variant={getStatusBadgeVariant(viewingPost.status)} className="text-[10px]">
                {viewingPost.status}
              </Badge>
              <span className="text-xs font-mono text-devpilot-purple">
                {viewingPost.contentType.replace('_', ' ')}
              </span>
              <span className="text-xs text-devpilot-subtle">•</span>
              <span className="text-xs text-devpilot-subtle">
                {viewingPost.category.replace(/_/g, ' ')}
              </span>
            </div>

            <h2 className="text-lg font-bold text-devpilot-text mb-3">{viewingPost.title}</h2>

            <div className="p-3.5 rounded-xl bg-black/30 border border-devpilot-border text-xs text-devpilot-text whitespace-pre-wrap leading-relaxed mb-4">
              {viewingPost.caption}
            </div>

            {/* Media Gallery in View Modal */}
            {viewingPost.mediaItems && viewingPost.mediaItems.length > 0 && (
              <div className="mb-4">
                <span className="text-xs font-semibold text-devpilot-text block mb-2">Attached Media</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {viewingPost.mediaItems.map((item) => (
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

            {/* Hashtags */}
            {viewingPost.hashtags && viewingPost.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {viewingPost.hashtags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded bg-devpilot-cyan/10 border border-devpilot-cyan/20 text-devpilot-cyan text-[11px] font-mono">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Review & Approval Actions */}
            {viewingPost.status !== PostStatus.APPROVED && viewingPost.status !== PostStatus.PUBLISHED && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-devpilot-bg border border-devpilot-border">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await apiRequest(`/content/${viewingPost.id}/approve`, { method: 'POST', data: {} });
                      setSuccessMessage(`Post "${viewingPost.title}" approved successfully.`);
                      setViewingPost(null);
                      fetchPosts();
                    } catch (err: unknown) {
                      const e = err as Error;
                      setError(e.message || 'Approval failed');
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 h-8"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve Content</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await apiRequest(`/content/${viewingPost.id}/reject`, { method: 'POST', data: {} });
                      setSuccessMessage(`Post "${viewingPost.title}" rejected.`);
                      setViewingPost(null);
                      fetchPosts();
                    } catch (err: unknown) {
                      const e = err as Error;
                      setError(e.message || 'Rejection failed');
                    }
                  }}
                  className="text-devpilot-danger border-devpilot-danger/30 hover:bg-devpilot-danger/10 text-xs gap-1.5 h-8"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-devpilot-subtle pt-3 border-t border-devpilot-border">
              <span>Author: {viewingPost.createdBy?.name}</span>
              <span>Created: {new Date(viewingPost.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Delete Post Modal */}
      {postToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative">
            <div className="flex items-center gap-3 mb-3 text-devpilot-danger">
              <div className="w-10 h-10 rounded-xl bg-devpilot-danger/10 border border-devpilot-danger/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-devpilot-text">Delete Content Post</h3>
                <p className="text-xs text-devpilot-muted">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-devpilot-muted leading-relaxed mb-4">
              Are you sure you want to delete <span className="font-semibold text-devpilot-text">&quot;{postToDelete.title}&quot;</span>? Attached media files will remain in your Media Library.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setPostToDelete(null)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeletePost}
                disabled={isSubmitting}
                className="bg-devpilot-danger hover:bg-devpilot-danger/90 text-white"
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
