import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Valid email address is required' }).max(255, { message: 'Email must not exceed 255 characters' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }).max(128, { message: 'Password must not exceed 128 characters' }),
});

export type LoginInput = z.infer<typeof loginSchema>;
