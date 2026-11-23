-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'ANALYST');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('SINGLE_IMAGE', 'CAROUSEL', 'REEL', 'STORY', 'MEME', 'BANNER', 'CODE_TIP', 'SHOWCASE');

-- CreateEnum
CREATE TYPE "ContentCategory" AS ENUM ('CODING_MEMES', 'DEVELOPER_LIFE', 'AI_VIBE_CODING', 'WEB_DEV_TIPS', 'PROGRAMMING_TUTORIALS', 'TECH_NEWS_TRENDS', 'TOOLS_RESOURCES', 'CODING_CHALLENGES', 'PROJECT_SHOWCASES', 'PORTFOLIO_SERVICE_PROMOTION');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('IDEA', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'REJECTED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'X');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_settings" (
    "id" UUID NOT NULL,
    "brand_name" TEXT NOT NULL DEFAULT 'CodeCulture',
    "tagline" TEXT NOT NULL DEFAULT 'Code. Create. Build. Repeat.',
    "logo_url" TEXT,
    "website_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#8B5CF6',
    "secondary_color" TEXT NOT NULL DEFAULT '#06B6D4',
    "tone" TEXT NOT NULL DEFAULT 'Informative, modern, developer-friendly, humorous',
    "audience" TEXT NOT NULL DEFAULT 'Web developers, students, freelancers, AI enthusiasts',
    "topics" TEXT[] DEFAULT ARRAY['Programming', 'Web Dev', 'AI', 'Memes', 'Tech Trends']::TEXT[],
    "avoid_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta_defaults" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_posts" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta" TEXT,
    "content_type" "ContentType" NOT NULL DEFAULT 'SINGLE_IMAGE',
    "category" "ContentCategory" NOT NULL DEFAULT 'WEB_DEV_TIPS',
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "brand_settings_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_media" (
    "id" UUID NOT NULL,
    "content_post_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "content_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_identifier" TEXT NOT NULL,
    "connection_status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "encrypted_access_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_platforms" (
    "id" UUID NOT NULL,
    "content_post_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "platform_caption" TEXT,
    "platform_status" TEXT NOT NULL DEFAULT 'PENDING',
    "external_post_id" TEXT,

    CONSTRAINT "content_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_schedules" (
    "id" UUID NOT NULL,
    "content_post_id" UUID NOT NULL,
    "social_account_id" UUID,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "content_post_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "content_posts_status_idx" ON "content_posts"("status");

-- CreateIndex
CREATE INDEX "content_posts_category_idx" ON "content_posts"("category");

-- CreateIndex
CREATE INDEX "content_posts_content_type_idx" ON "content_posts"("content_type");

-- CreateIndex
CREATE INDEX "content_posts_scheduled_at_idx" ON "content_posts"("scheduled_at");

-- CreateIndex
CREATE INDEX "content_media_content_post_id_idx" ON "content_media"("content_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_media_content_post_id_media_asset_id_key" ON "content_media"("content_post_id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_platforms_content_post_id_social_account_id_key" ON "content_platforms"("content_post_id", "social_account_id");

-- CreateIndex
CREATE INDEX "content_schedules_scheduled_at_idx" ON "content_schedules"("scheduled_at");

-- CreateIndex
CREATE INDEX "content_schedules_status_idx" ON "content_schedules"("status");

-- CreateIndex
CREATE INDEX "approvals_content_post_id_idx" ON "approvals"("content_post_id");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- AddForeignKey
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_brand_settings_id_fkey" FOREIGN KEY ("brand_settings_id") REFERENCES "brand_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_content_post_id_fkey" FOREIGN KEY ("content_post_id") REFERENCES "content_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_platforms" ADD CONSTRAINT "content_platforms_content_post_id_fkey" FOREIGN KEY ("content_post_id") REFERENCES "content_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_platforms" ADD CONSTRAINT "content_platforms_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_schedules" ADD CONSTRAINT "content_schedules_content_post_id_fkey" FOREIGN KEY ("content_post_id") REFERENCES "content_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_schedules" ADD CONSTRAINT "content_schedules_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_content_post_id_fkey" FOREIGN KEY ("content_post_id") REFERENCES "content_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
