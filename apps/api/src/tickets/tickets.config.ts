import { ConfigService } from '@nestjs/config';

export interface TicketsConfiguration {
  qrSigningSecret: string;
  appPublicUrl: string;
}

export function readTicketsConfiguration(
  config: ConfigService,
): TicketsConfiguration {
  const qrSigningSecret = config.get<string>('QR_SIGNING_SECRET')?.trim();
  if (!qrSigningSecret || qrSigningSecret.length < 32) {
    throw new Error('QR_SIGNING_SECRET must have at least 32 characters.');
  }

  const publicUrlValue =
    config.get<string>('APP_PUBLIC_URL')?.trim() ?? 'http://localhost:3000';
  let publicUrl: URL;
  try {
    publicUrl = new URL(publicUrlValue);
  } catch {
    throw new Error('APP_PUBLIC_URL must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(publicUrl.protocol)) {
    throw new Error('APP_PUBLIC_URL must use HTTP or HTTPS.');
  }

  return {
    qrSigningSecret,
    appPublicUrl: publicUrl.toString().replace(/\/$/, ''),
  };
}
