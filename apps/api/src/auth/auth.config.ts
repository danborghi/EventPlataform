import type { ConfigService } from '@nestjs/config';

export interface JwtConfiguration {
  secret: string;
  expiresInSeconds: number;
}

export function readJwtConfiguration(config: ConfigService): JwtConfiguration {
  const secret = config.getOrThrow<string>('JWT_SECRET');
  const expiresInSeconds = Number(
    config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? '3600',
  );

  if (secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }

  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 60 ||
    expiresInSeconds > 86_400
  ) {
    throw new Error(
      'JWT_EXPIRES_IN_SECONDS must be an integer between 60 and 86400.',
    );
  }

  return { secret, expiresInSeconds };
}
