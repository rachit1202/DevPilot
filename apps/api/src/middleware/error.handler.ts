import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // 1. Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: 'Validation failed',
      issues: error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  // 2. Handle Fastify schema validation errors
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: 'Validation failed',
      message: error.message,
    });
  }

  // 3. Handle Rate Limit exceeded (429)
  if (error.statusCode === 429) {
    return reply.status(429).send({
      success: false,
      error: 'Too Many Requests',
      message: 'Too many login attempts. Please wait before trying again.',
    });
  }

  // 4. Handle custom HTTP errors
  const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 500;

  // Handle explicit AI persistence failure (500) contract
  if ((error as any).code === 'HISTORY_PERSISTENCE_FAILED') {
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: error.message,
      code: 'HISTORY_PERSISTENCE_FAILED',
    });
  }

  // Log 500 internal server errors safely
  if (statusCode === 500) {
    request.log.error({
      err: error.message,
      url: request.url,
      method: request.method,
    }, 'Internal Server Error');

    return reply.status(500).send({
      success: false,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }

  return reply.status(statusCode).send({
    success: false,
    error: error.name || 'Error',
    message: error.message,
  });
}
