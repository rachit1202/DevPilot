-- AlterTable
ALTER TABLE "application_settings" ADD COLUMN     "is_singleton" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "brand_settings" ADD COLUMN     "is_singleton" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "application_settings_is_singleton_key" ON "application_settings"("is_singleton");

-- CreateIndex
CREATE UNIQUE INDEX "brand_settings_brand_name_key" ON "brand_settings"("brand_name");

-- CreateIndex
CREATE UNIQUE INDEX "brand_settings_is_singleton_key" ON "brand_settings"("is_singleton");
