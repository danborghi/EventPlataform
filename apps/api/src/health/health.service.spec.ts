import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('reports the process as live without checking dependencies', () => {
    const prisma = {} as PrismaService;
    const service = new HealthService(prisma);

    expect(service.live()).toEqual({ status: 'ok' });
  });

  it('reports readiness when PostgreSQL responds', async () => {
    const prisma = {
      $queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    await expect(service.ready()).resolves.toEqual({
      status: 'ready',
      dependencies: { database: 'up' },
    });
  });

  it('returns service unavailable when PostgreSQL does not respond', async () => {
    const prisma = {
      $queryRaw: () => Promise.reject(new Error('unavailable')),
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    await expect(service.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
