import { FastifyInstance } from 'fastify';
import { SettingsController } from './settings.controller';
import { authGuard } from '../../middleware/auth.guard';

export async function settingsRoutes(server: FastifyInstance) {
  // Brand Settings
  server.get('/brand', { preHandler: [authGuard] }, SettingsController.getBrand);
  server.patch('/brand', { preHandler: [authGuard] }, SettingsController.updateBrand);
  server.put('/brand', { preHandler: [authGuard] }, SettingsController.updateBrand);

  // Application Settings
  server.get('/app', { preHandler: [authGuard] }, SettingsController.getApp);
  server.patch('/app', { preHandler: [authGuard] }, SettingsController.updateApp);
  server.put('/app', { preHandler: [authGuard] }, SettingsController.updateApp);
}
