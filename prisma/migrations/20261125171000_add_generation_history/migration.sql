-- CreateEnum
CREATE TYPE "AIGenerationType" AS ENUM ('IDEAS', 'CAPTION', 'HOOKS', 'HASHTAGS', 'CTA', 'REWRITE');

-- CreateTable
CREATE TABLE "generation_histories" (
    "id" UUID NOT NULL,
    "generation_type" "AIGenerationType" NOT NULL,
    "input_payload" JSONB NOT NULL,
    "output_payload" JSONB NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'qwen2.5:3b',
    "duration_ms" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "resulting_post_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generation_histories_resulting_post_id_key" ON "generation_histories"("resulting_post_id");

-- CreateIndex
CREATE INDEX "generation_histories_user_id_created_at_idx" ON "generation_histories"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "generation_histories_generation_type_idx" ON "generation_histories"("generation_type");

-- CreateIndex
CREATE INDEX "generation_histories_created_at_idx" ON "generation_histories"("created_at");

-- AddForeignKey
ALTER TABLE "generation_histories" ADD CONSTRAINT "generation_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_histories" ADD CONSTRAINT "generation_histories_resulting_post_id_fkey" FOREIGN KEY ("resulting_post_id") REFERENCES "content_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
