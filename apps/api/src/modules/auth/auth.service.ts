import * as bcrypt from 'bcryptjs';
import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { AuthUser } from '../../types/fastify';
import { UserRole } from '@devpilot/shared';

export class AuthService {
  static async login(
    email: string,
    rawPassword: string,
    clientIp?: string
  ): Promise<AuthUser> {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Query user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Record failed attempt without revealing email existence
      await ActivityService.log({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        metadata: { attemptedEmail: normalizedEmail, ip: clientIp, reason: 'Invalid credentials' },
      });
      throw new Error('INVALID_CREDENTIALS');
    }

    // 2. Verify password with bcrypt
    const isMatch = await bcrypt.compare(rawPassword, user.passwordHash);
    if (!isMatch) {
      await ActivityService.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        metadata: { ip: clientIp, reason: 'Invalid credentials' },
      });
      throw new Error('INVALID_CREDENTIALS');
    }

    // 3. Log successful login
    await ActivityService.log({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      metadata: { ip: clientIp },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
    };
  }

  static async logout(userId: string) {
    await ActivityService.log({
      userId,
      action: 'USER_LOGOUT',
      entityType: 'User',
      entityId: userId,
    });
  }

  static async getMe(userId: string): Promise<AuthUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
    };
  }
}
