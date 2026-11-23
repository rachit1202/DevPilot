import { FastifyReply, FastifyRequest } from 'fastify';
import { SettingsService } from './settings.service';
import { updateBrandSchema, updateApplicationSettingsSchema } from '@devpilot/validation';
import { AuthUser } from '../../types/fastify';

export class SettingsController {
  static async getBrand(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = await SettingsService.getBrandSettings();
      return reply.status(200).send({
        success: true,
        data,
      });
    } catch (err: unknown) {
      throw err;
    }
  }

  static async updateBrand(request: FastifyRequest, reply: FastifyReply) {
    const input = updateBrandSchema.parse(request.body);
    const user = request.user as AuthUser;

    try {
      const data = await SettingsService.updateBrandSettings(input, user);
      return reply.status(200).send({
        success: true,
        message: 'Brand settings updated successfully',
        data,
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith('FORBIDDEN')) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }

  static async getApp(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = await SettingsService.getApplicationSettings();
      return reply.status(200).send({
        success: true,
        data,
      });
    } catch (err: unknown) {
      throw err;
    }
  }

  static async updateApp(request: FastifyRequest, reply: FastifyReply) {
    const input = updateApplicationSettingsSchema.parse(request.body);
    const user = request.user as AuthUser;

    try {
      const data = await SettingsService.updateApplicationSettings(input, user);
      return reply.status(200).send({
        success: true,
        message: 'Application settings updated successfully',
        data,
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith('FORBIDDEN')) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: error.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      throw err;
    }
  }
}
