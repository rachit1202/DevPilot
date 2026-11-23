import { FastifyInstance } from 'fastify';

export async function healthRoutes(server: FastifyInstance) {
  server.get('/health', async () => {
    return {
      success: true,
      data: {
        status: 'ok',
        service: 'devpilot-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    };
  });
}
