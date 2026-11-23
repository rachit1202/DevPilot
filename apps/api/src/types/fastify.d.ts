import { UserRole } from '@devpilot/shared';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
    };
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
