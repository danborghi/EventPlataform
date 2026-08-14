import { ConfigService } from '@nestjs/config';
import { readTicketsConfiguration } from './tickets.config.js';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('readTicketsConfiguration', () => {
  it('requires a separate strong signing secret', () => {
    expect(() =>
      readTicketsConfiguration(config({ QR_SIGNING_SECRET: 'short' })),
    ).toThrow('QR_SIGNING_SECRET');
  });

  it('normalizes the public application URL', () => {
    expect(
      readTicketsConfiguration(
        config({
          QR_SIGNING_SECRET: 'a'.repeat(32),
          APP_PUBLIC_URL: 'https://tickets.example.com/',
        }),
      ),
    ).toEqual({
      qrSigningSecret: 'a'.repeat(32),
      appPublicUrl: 'https://tickets.example.com',
    });
  });
});
