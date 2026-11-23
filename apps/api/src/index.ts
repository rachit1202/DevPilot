import { buildServer } from './server';
import { config } from './config/env';
import { prisma } from './db/prisma';

async function main() {
  const server = buildServer();

  try {
    const address = await server.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });
    console.log(`DevPilot API Server running at ${address}`);
    console.log(`Environment: ${config.NODE_ENV}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    try {
      await server.close();
      await prisma.$disconnect();
      console.log('Server and database disconnected cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
