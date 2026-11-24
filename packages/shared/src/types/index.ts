import { UserRole, ContentType, ContentCategory, PostStatus, PlatformType, ApprovalStatus } from '../enums/index.js';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface BrandSettings {
  id: string;
  brandName: string;
  tagline: string;
  description?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
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
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ApplicationSettings {
  id: string;
  isSingleton?: boolean;
  timezone: string;
  defaultLanguage: string;
  timeFormat: string;
  dateFormat: string;
  firstDayOfWeek: number;
  defaultView: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface MediaAsset {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  createdAt: Date | string;
}

export interface ContentMediaLink {
  id: string;
  contentPostId: string;
  mediaAssetId: string;
  position: number;
  mediaAsset?: MediaAsset;
}

export interface ContentPost {
  id: string;
  title: string;
  caption: string;
  hashtags: string[];
  cta?: string | null;
  contentType: ContentType;
  category: ContentCategory;
  status: PostStatus;
  sourceType: string;
  scheduledAt?: Date | string | null;
  publishedAt?: Date | string | null;
  createdById: string;
  createdBy?: User;
  brandSettingsId: string;
  brandSettings?: BrandSettings;
  mediaItems?: ContentMediaLink[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SocialAccount {
  id: string;
  platform: PlatformType;
  accountName: string;
  accountIdentifier: string;
  connectionStatus: string;
  encryptedAccessToken?: string | null;
  tokenExpiresAt?: Date | string | null;
  lastSyncAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ContentPlatform {
  id: string;
  contentPostId: string;
  socialAccountId: string;
  socialAccount?: SocialAccount;
  platformCaption?: string | null;
  platformStatus: string;
  externalPostId?: string | null;
}

export interface Approval {
  id: string;
  contentPostId: string;
  contentPost?: ContentPost;
  requestedById: string;
  requestedBy?: User;
  reviewedById?: string | null;
  reviewedBy?: User | null;
  status: ApprovalStatus;
  comment?: string | null;
  reviewedAt?: Date | string | null;
  createdAt: Date | string;
}

export interface ActivityLog {
  id: string;
  userId?: string | null;
  user?: User | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | null;
  message?: string;
}

export * from './ai.js';

