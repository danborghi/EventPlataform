import type { ConfigService } from '@nestjs/config';

export interface LoginRateLimitConfiguration {
  limit: number;
  windowMs: number;
}

export function readLoginRateLimitConfiguration(
  config: ConfigService,
): LoginRateLimitConfiguration {
  const limit = Number(config.get<string>('AUTH_LOGIN_RATE_LIMIT') ?? '5');
  const windowMs = Number(
    config.get<string>('AUTH_LOGIN_RATE_WINDOW_MS') ?? '60000',
  );

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error(
      'AUTH_LOGIN_RATE_LIMIT must be an integer between 1 and 100.',
    );
  }

  if (!Number.isInteger(windowMs) || windowMs < 1_000 || windowMs > 3_600_000) {
    throw new Error(
      'AUTH_LOGIN_RATE_WINDOW_MS must be an integer between 1000 and 3600000.',
    );
  }

  return { limit, windowMs };
}
