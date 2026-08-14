import type { ConfigService } from '@nestjs/config';
import { readTmdbConfiguration } from './catalog.config.js';

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('readTmdbConfiguration', () => {
  it('uses safe defaults and allows the token to be configured later', () => {
    expect(readTmdbConfiguration(config({}))).toEqual({
      apiReadToken: null,
      apiBaseUrl: 'https://api.themoviedb.org/3',
      imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
      language: 'pt-BR',
      region: 'BR',
      timeoutMs: 5000,
    });
  });

  it.each([
    [{ TMDB_API_BASE_URL: 'http://api.example.com' }, 'must use HTTPS'],
    [{ TMDB_LANGUAGE: 'pt' }, 'TMDB_LANGUAGE'],
    [{ TMDB_REGION: 'BRA' }, 'TMDB_REGION'],
    [{ TMDB_TIMEOUT_MS: '99' }, 'TMDB_TIMEOUT_MS'],
  ])('rejects invalid configuration', (values, expectedMessage) => {
    expect(() => readTmdbConfiguration(config(values))).toThrow(
      expectedMessage,
    );
  });
});
