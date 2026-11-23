import { FastifyReply, FastifyRequest } from 'fastify';
import { loginSchema } from '@devpilot/validation';
import { AuthService } from './auth.service';
import { config } from '../../config/env';

export class AuthController {
  static async login(request: FastifyRequest, reply: FastifyReply) {
    // 1. Zod input validation
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    try {
      const user = await AuthService.login(
        parsed.data.email,
        parsed.data.password,
        request.ip
      );

      // 2. Sign JWT token
      const token = request.server.jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        { expiresIn: '7d' }
      );

      // 3. Set HttpOnly cookie
      reply.setCookie('access_token', token, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      });

      return reply.status(200).send({
        success: true,
        data: {
          user,
          token, // Returned for programmatic API access
        },
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message === 'INVALID_CREDENTIALS') {
        return reply.status(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid email or password.',
        });
      }
      throw err;
    }
  }

  static async logout(request: FastifyRequest, reply: FastifyReply) {
    if (request.user) {
      const user = request.user as unknown as { id: string };
      await AuthService.logout(user.id);
    }

    reply.clearCookie('access_token', {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  }

  static async me(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required.',
      });
    }

    const authUser = request.user as unknown as { id: string };
    const user = await AuthService.getMe(authUser.id);
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message: 'User account not found.',
      });
    }

    return reply.status(200).send({
      success: true,
      data: { user },
    });
  }
}
