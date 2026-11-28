import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  STORAGE_DIR: z.string().default('./storage'),
  UPLOAD_DIR: z.string().default('./storage/uploads'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:3b'),
  OLLAMA_TIMEOUT_MS: z.coerce
    .number()
    .int('OLLAMA_TIMEOUT_MS must be an integer')
    .min(60000, 'OLLAMA_TIMEOUT_MS must be at least 60000 (1 minute)')
    .max(300000, 'OLLAMA_TIMEOUT_MS cannot exceed 300000 (5 minutes)')
    .default(120000),
  AI_LOCK_PORT: z.coerce
    .number()
    .int('AI_LOCK_PORT must be an integer')
    .min(1, 'AI_LOCK_PORT must be at least 1')
    .max(65535, 'AI_LOCK_PORT cannot exceed 65535')
    .default(54321),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof envSchema>;
