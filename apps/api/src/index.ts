import { buildServer } from './server';
import { config } from './config/env';
import { prisma } from './db/prisma';
import { GenerationMutex } from './modules/ai/generation.mutex';
import { ResetReconciliationService } from './modules/ai/reset.reconciliation';
import { PidLockManager } from './modules/ai/pid.lock';

async function main() {
  const server = buildServer();

  // Initialize AI Engine, PID lock, and startup reconciliation
  try {
    await GenerationMutex.initialize();
    await ResetReconciliationService.reconcileOnStartup();
  } catch (aiErr) {
    console.error('Warning during AI engine initialization:', aiErr);
  }

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
      await PidLockManager.releaseOwnership();
      await prisma.$disconnect();
      console.log('Server and database disconnected cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
