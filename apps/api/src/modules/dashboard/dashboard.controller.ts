import { FastifyReply, FastifyRequest } from 'fastify';
import { DashboardService } from './dashboard.service';
import { AuthUser } from '../../types/fastify';

export class DashboardController {
  static async getSummary(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as AuthUser;
    const data = await DashboardService.getSummary(user);

    return reply.status(200).send({
      success: true,
      data,
    });
  }
}
