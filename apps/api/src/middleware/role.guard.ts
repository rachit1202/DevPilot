import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@devpilot/shared';
import { AuthUser } from '../types/fastify';

export function roleGuard(...allowedRoles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required.',
      });
    }

    const user = request.user as AuthUser;
    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to perform this action.',
      });
    }
  };
}
