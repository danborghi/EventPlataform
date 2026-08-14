import type { ConfigService } from '@nestjs/config';
import { readLoginRateLimitConfiguration } from './login-rate-limit.config.js';

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('readLoginRateLimitConfiguration', () => {
  it('uses the documented defaults', () => {
    expect(readLoginRateLimitConfiguration(config({}))).toEqual({
      limit: 5,
      windowMs: 60_000,
    });
  });

  it.each([
    [{ AUTH_LOGIN_RATE_LIMIT: '0' }, 'AUTH_LOGIN_RATE_LIMIT'],
    [{ AUTH_LOGIN_RATE_LIMIT: 'not-a-number' }, 'AUTH_LOGIN_RATE_LIMIT'],
    [{ AUTH_LOGIN_RATE_WINDOW_MS: '999' }, 'AUTH_LOGIN_RATE_WINDOW_MS'],
  ])('rejects invalid configuration', (values, expectedMessage) => {
    expect(() => readLoginRateLimitConfiguration(config(values))).toThrow(
      expectedMessage,
    );
  });
});
