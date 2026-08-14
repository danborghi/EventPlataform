import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live() {
    return { status: 'ok' as const };
  }

  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ready' as const,
        dependencies: { database: 'up' as const },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        dependencies: { database: 'down' },
      });
    }
  }
}
