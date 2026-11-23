-- AlterTable
ALTER TABLE "brand_settings" ADD COLUMN     "description" TEXT,
ADD COLUMN     "guidelines" TEXT,
ADD COLUMN     "industry" TEXT DEFAULT 'Developer Education & Tech Media',
ADD COLUMN     "primary_language" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "application_settings" (
    "id" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "default_language" TEXT NOT NULL DEFAULT 'en',
    "time_format" TEXT NOT NULL DEFAULT '12h',
    "date_format" TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    "first_day_of_week" INTEGER NOT NULL DEFAULT 0,
    "default_view" TEXT NOT NULL DEFAULT 'month',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_settings_pkey" PRIMARY KEY ("id")
);
