-- Create partial unique index to guarantee at most one active schedule per content post
CREATE UNIQUE INDEX "unique_active_content_schedule" ON "content_schedules" ("content_post_id") WHERE status = 'SCHEDULED';
