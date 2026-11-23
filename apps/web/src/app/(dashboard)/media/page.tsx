'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiRequest, apiUpload, API_BASE_URL } from '@/lib/api';
import {
  Image as ImageIcon,
  UploadCloud,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle2,
  FileText,
  X,
  RefreshCw,
  HardDrive,
  Link as LinkIcon,
} from 'lucide-react';

interface MediaAsset {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  fileUrl: string;
  linkedPostsCount?: number;
  createdAt: string;
  linkedPosts?: Array<{ id: string; title: string; status: string }>;
}

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View Details modal state
  const [viewAsset, setViewAsset] = useState<MediaAsset | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Delete modal state
  const [assetToDelete, setAssetToDelete] = useState<MediaAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchMedia = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; data: { assets: MediaAsset[] } }>('/media');
      if (res.success && res.data) {
        setAssets(res.data.assets || []);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to load media assets');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side quick validation
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setUploadError(`Invalid file format. Only JPEG, PNG, WebP, and GIF images are permitted.`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 10MB.`);
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await apiUpload<{ success: boolean; message: string; data: { asset: MediaAsset } }>('/media/upload', formData);

      if (res.success) {
        setSuccessMessage('Media asset uploaded and verified successfully.');
        setTimeout(() => setSuccessMessage(null), 4000);
        closeUploadModal();
        await fetchMedia();
      }
    } catch (err: unknown) {
      const e = err as Error;
      setUploadError(e.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setUploadError(null);
  };

  const openAssetDetails = async (asset: MediaAsset) => {
    setViewAsset(asset);
    setIsLoadingDetails(true);
    try {
      const res = await apiRequest<{ success: boolean; data: { asset: MediaAsset } }>(`/media/${asset.id}`);
      if (res.success && res.data.asset) {
        setViewAsset(res.data.asset);
      }
    } catch (err) {
      console.warn('Failed to fetch deep asset details:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleDeleteAsset = async () => {
    if (!assetToDelete) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await apiRequest(`/media/${assetToDelete.id}`, {
        method: 'DELETE',
      });

      setSuccessMessage(`Asset "${assetToDelete.originalName}" was permanently deleted.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setAssetToDelete(null);
      await fetchMedia();
    } catch (err: unknown) {
      const e = err as Error;
      setDeleteError(e.message || 'Failed to delete media asset');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const totalStorage = assets.reduce((sum, a) => sum + a.fileSize, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media Library"
        description="Securely upload, organize, and manage image assets for CodeCulture posts."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Media Library' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchMedia} disabled={isLoading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setShowUploadModal(true)} className="gap-1.5 bg-devpilot-purple hover:bg-devpilot-purple/90 text-white">
              <UploadCloud className="w-4 h-4" />
              <span>Upload Media</span>
            </Button>
          </div>
        }
      />

      {/* Storage Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-center justify-center text-devpilot-purple">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-devpilot-muted">Total Media Assets</p>
            <p className="text-xl font-bold text-devpilot-text mt-0.5">{assets.length}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-devpilot-cyan/10 border border-devpilot-cyan/20 flex items-center justify-center text-devpilot-cyan">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-devpilot-muted">Storage Consumed</p>
            <p className="text-xl font-bold text-devpilot-text mt-0.5">{formatBytes(totalStorage)}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-devpilot-card border border-devpilot-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-devpilot-muted">Storage Protection</p>
            <p className="text-xs font-semibold text-emerald-400 mt-1">Magic Bytes & Nosniff Active</p>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
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

      {/* Media Grid / Empty State */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-devpilot-card border border-devpilot-border animate-pulse p-2 flex flex-col justify-end" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No Media Assets Stored"
          description="Upload images (JPEG, PNG, WebP, GIF) to attach them to CodeCulture social posts."
          actionLabel="Upload First Asset"
          onAction={() => setShowUploadModal(true)}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {assets.map((asset) => {
            const imageUrl = `${API_BASE_URL}/media/${asset.id}/file`;
            return (
              <div
                key={asset.id}
                className="group relative rounded-xl bg-devpilot-card border border-devpilot-border hover:border-devpilot-purple/50 transition-all overflow-hidden flex flex-col shadow-sm"
              >
                {/* Thumbnail Display */}
                <div className="aspect-square w-full bg-black/40 relative overflow-hidden flex items-center justify-center">
                  <img
                    src={imageUrl}
                    alt={asset.originalName}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Overlay Action Buttons on Hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => openAssetDetails(asset)}
                      title="View Details"
                      className="p-2 rounded-lg bg-devpilot-card/90 text-devpilot-text hover:text-white hover:bg-devpilot-purple transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setAssetToDelete(asset)}
                      title="Delete Asset"
                      className="p-2 rounded-lg bg-devpilot-card/90 text-devpilot-danger hover:bg-devpilot-danger hover:text-white transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Format Pill */}
                  <div className="absolute top-2 left-2 pointer-events-none">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-black/70 backdrop-blur-md text-white border border-white/10 uppercase">
                      {asset.mimeType.replace('image/', '')}
                    </span>
                  </div>

                  {/* Linked Posts Indicator */}
                  {asset.linkedPostsCount !== undefined && asset.linkedPostsCount > 0 && (
                    <div className="absolute top-2 right-2 pointer-events-none">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-devpilot-purple/80 backdrop-blur-md text-white flex items-center gap-1">
                        <LinkIcon className="w-2.5 h-2.5" />
                        <span>{asset.linkedPostsCount}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Metadata footer */}
                <div className="p-2.5 flex flex-col gap-1">
                  <p className="text-xs font-medium text-devpilot-text truncate" title={asset.originalName}>
                    {asset.originalName}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-devpilot-muted">
                    <span>{formatBytes(asset.fileSize)}</span>
                    <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Media Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative">
            <button
              onClick={closeUploadModal}
              disabled={isUploading}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-devpilot-border">
              <div className="w-9 h-9 rounded-xl bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-center justify-center text-devpilot-purple">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-devpilot-text">Upload Media Asset</h3>
                <p className="text-xs text-devpilot-muted">Supported formats: JPEG, PNG, WebP, GIF (Max 10MB)</p>
              </div>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Dropzone container */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                  previewUrl
                    ? 'border-devpilot-purple/40 bg-devpilot-purple/5'
                    : 'border-devpilot-border hover:border-devpilot-purple/50 bg-black/20 hover:bg-black/30'
                }`}
              >
                {previewUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={previewUrl} alt="Preview" className="max-h-40 rounded-lg object-contain border border-devpilot-border shadow-md" />
                    <span className="text-xs font-medium text-devpilot-purple">{selectedFile?.name} ({formatBytes(selectedFile?.size || 0)})</span>
                    <span className="text-[11px] text-devpilot-muted">Click to select a different image</span>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-devpilot-purple/10 flex items-center justify-center text-devpilot-purple">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold text-devpilot-text">Click or drag an image here to upload</p>
                      <p className="text-[11px] text-devpilot-muted mt-0.5">Strict file signature & magic byte checks enforced</p>
                    </div>
                  </>
                )}
              </div>

              {uploadError && (
                <div className="p-3 rounded-lg bg-devpilot-danger/10 border border-devpilot-danger/20 flex items-start gap-2 text-xs text-devpilot-danger">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={closeUploadModal} disabled={isUploading}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!selectedFile || isUploading}
                  className="bg-devpilot-purple hover:bg-devpilot-purple/90 text-white min-w-[100px]"
                >
                  {isUploading ? (
                    <div className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    'Save Asset'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset Details Modal */}
      {viewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewAsset(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-devpilot-muted hover:text-devpilot-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-devpilot-border">
              <div className="w-9 h-9 rounded-xl bg-devpilot-cyan/10 border border-devpilot-cyan/20 flex items-center justify-center text-devpilot-cyan">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 pr-8">
                <h3 className="text-base font-bold text-devpilot-text truncate">{viewAsset.originalName}</h3>
                <p className="text-xs text-devpilot-muted font-mono">{viewAsset.id}</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Full Image Preview */}
              <div className="w-full rounded-xl bg-black/40 border border-devpilot-border p-2 flex items-center justify-center max-h-80 overflow-hidden">
                <img
                  src={`${API_BASE_URL}/media/${viewAsset.id}/file`}
                  alt={viewAsset.originalName}
                  className="max-h-72 object-contain rounded-lg"
                />
              </div>

              {/* Technical Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-devpilot-border">
                  <span className="text-devpilot-subtle block">Format</span>
                  <span className="font-semibold text-devpilot-text mt-0.5 block uppercase">{viewAsset.mimeType}</span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-devpilot-border">
                  <span className="text-devpilot-subtle block">File Size</span>
                  <span className="font-semibold text-devpilot-text mt-0.5 block">{formatBytes(viewAsset.fileSize)}</span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-devpilot-border">
                  <span className="text-devpilot-subtle block">Uploaded On</span>
                  <span className="font-semibold text-devpilot-text mt-0.5 block">{new Date(viewAsset.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Linked Content Posts */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-devpilot-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-devpilot-text flex items-center gap-1.5">
                    <LinkIcon className="w-3.5 h-3.5 text-devpilot-purple" />
                    <span>Linked Content Posts</span>
                  </span>
                  <span className="text-[11px] text-devpilot-muted">
                    {viewAsset.linkedPosts?.length || viewAsset.linkedPostsCount || 0} associated post(s)
                  </span>
                </div>

                {isLoadingDetails ? (
                  <p className="text-xs text-devpilot-muted">Loading associations...</p>
                ) : viewAsset.linkedPosts && viewAsset.linkedPosts.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    {viewAsset.linkedPosts.map((p) => (
                      <div key={p.id} className="p-2 rounded-lg bg-devpilot-card border border-devpilot-border/70 flex items-center justify-between text-xs">
                        <span className="font-medium text-devpilot-text truncate max-w-[280px]">{p.title}</span>
                        <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-devpilot-muted py-2">This asset is not attached to any content post yet.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-devpilot-border">
              <Button size="sm" variant="outline" onClick={() => setViewAsset(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {assetToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-devpilot-card border border-devpilot-border shadow-2xl p-6 relative">
            <div className="flex items-center gap-3 mb-3 text-devpilot-danger">
              <div className="w-10 h-10 rounded-xl bg-devpilot-danger/10 border border-devpilot-danger/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-devpilot-text">Delete Media Asset</h3>
                <p className="text-xs text-devpilot-muted">Permanent deletion from local storage</p>
              </div>
            </div>

            <p className="text-xs text-devpilot-muted leading-relaxed mb-4">
              Are you sure you want to delete <span className="font-semibold text-devpilot-text">&quot;{assetToDelete.originalName}&quot;</span>? This will permanently remove the binary file from disk.
            </p>

            {deleteError && (
              <div className="mb-4 p-3 rounded-lg bg-devpilot-danger/10 border border-devpilot-danger/20 flex items-start gap-2 text-xs text-devpilot-danger">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setAssetToDelete(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteAsset}
                disabled={isDeleting}
                className="bg-devpilot-danger hover:bg-devpilot-danger/90 text-white"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
