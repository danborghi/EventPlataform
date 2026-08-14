import type { ConfigService } from '@nestjs/config';

export interface TmdbConfiguration {
  apiReadToken: string | null;
  apiBaseUrl: string;
  imageBaseUrl: string;
  language: string;
  region: string;
  timeoutMs: number;
}

function normalizedUrl(value: string, variableName: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${variableName} must use HTTPS.`);
  }

  return url.toString().replace(/\/$/, '');
}

export function readTmdbConfiguration(
  config: ConfigService,
): TmdbConfiguration {
  const apiReadToken =
    config.get<string>('TMDB_API_READ_TOKEN')?.trim() || null;
  const apiBaseUrl = normalizedUrl(
    config.get<string>('TMDB_API_BASE_URL') ?? 'https://api.themoviedb.org/3',
    'TMDB_API_BASE_URL',
  );
  const imageBaseUrl = normalizedUrl(
    config.get<string>('TMDB_IMAGE_BASE_URL') ??
      'https://image.tmdb.org/t/p/w500',
    'TMDB_IMAGE_BASE_URL',
  );
  const language = config.get<string>('TMDB_LANGUAGE') ?? 'pt-BR';
  const region = config.get<string>('TMDB_REGION') ?? 'BR';
  const timeoutMs = Number(config.get<string>('TMDB_TIMEOUT_MS') ?? '5000');

  if (!/^[a-z]{2}-[A-Z]{2}$/.test(language)) {
    throw new Error('TMDB_LANGUAGE must use the ll-CC format.');
  }

  if (!/^[A-Z]{2}$/.test(region)) {
    throw new Error('TMDB_REGION must be an ISO 3166-1 alpha-2 code.');
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error(
      'TMDB_TIMEOUT_MS must be an integer between 100 and 30000.',
    );
  }

  return {
    apiReadToken,
    apiBaseUrl,
    imageBaseUrl,
    language,
    region,
    timeoutMs,
  };
}
