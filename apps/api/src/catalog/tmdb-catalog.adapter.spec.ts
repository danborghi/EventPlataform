import { ConfigService } from '@nestjs/config';
import { ApiException } from '../common/errors/api.exception.js';
import type { TmdbFetch } from './tmdb-fetch.token.js';
import { TmdbCatalogAdapter } from './tmdb-catalog.adapter.js';

const baseConfiguration = {
  TMDB_API_READ_TOKEN: 'test-read-token',
  TMDB_TIMEOUT_MS: '100',
};

function config(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string) => ({ ...baseConfiguration, ...values })[key],
  } as ConfigService;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: Parameters<TmdbFetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

describe('TmdbCatalogAdapter', () => {
  it('searches and normalizes movie summaries without exposing the token', async () => {
    let requestedUrl = '';
    let authorization = '';
    const fetcher: TmdbFetch = (input, init) => {
      requestedUrl = requestUrl(input);
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return Promise.resolve(
        jsonResponse({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 157336,
              title: 'Interestelar',
              original_title: 'Interstellar',
              overview: 'Exploradores atravessam um buraco de minhoca.',
              poster_path: '/poster.jpg',
              release_date: '2014-11-05',
            },
          ],
        }),
      );
    };
    const adapter = new TmdbCatalogAdapter(config(), fetcher);

    const result = await adapter.searchMovies('Interestelar', 1);

    expect(requestedUrl).toContain('/search/movie?');
    expect(requestedUrl).toContain('query=Interestelar');
    expect(requestedUrl).toContain('language=pt-BR');
    expect(requestedUrl).toContain('include_adult=false');
    expect(requestedUrl).not.toContain('test-read-token');
    expect(authorization).toBe('Bearer test-read-token');
    expect(result).toEqual({
      data: [
        {
          externalProvider: 'TMDB',
          externalId: '157336',
          title: 'Interestelar',
          originalTitle: 'Interstellar',
          overview: 'Exploradores atravessam um buraco de minhoca.',
          posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          releaseDate: '2014-11-05',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
  });

  it('requests now-playing for the configured region', async () => {
    let requestedUrl = '';
    const fetcher: TmdbFetch = (input) => {
      requestedUrl = requestUrl(input);
      return Promise.resolve(
        jsonResponse({
          page: 1,
          results: [],
          total_pages: 0,
          total_results: 0,
        }),
      );
    };
    const adapter = new TmdbCatalogAdapter(config(), fetcher);

    await adapter.nowPlaying(1);

    expect(requestedUrl).toContain('/movie/now_playing?');
    expect(requestedUrl).toContain('region=BR');
  });

  it('normalizes movie details, genres and runtime', async () => {
    const fetcher: TmdbFetch = () =>
      Promise.resolve(
        jsonResponse({
          id: 157336,
          title: 'Interestelar',
          original_title: 'Interstellar',
          overview: 'Descrição completa.',
          poster_path: null,
          release_date: '2014-11-05',
          runtime: 169,
          genres: [
            { id: 18, name: 'Drama' },
            { id: 878, name: 'Ficção científica' },
          ],
        }),
      );
    const adapter = new TmdbCatalogAdapter(config(), fetcher);

    const result = await adapter.movieDetails('157336');

    expect(result).toMatchObject({
      externalId: '157336',
      posterUrl: null,
      runtimeMinutes: 169,
      genres: ['Drama', 'Ficção científica'],
    });
  });

  it('maps a missing movie to CATALOG_ITEM_NOT_FOUND', async () => {
    const adapter = new TmdbCatalogAdapter(config(), () =>
      Promise.resolve(jsonResponse({ status_message: 'Not found' }, 404)),
    );

    await expect(adapter.movieDetails('999999')).rejects.toMatchObject({
      code: 'CATALOG_ITEM_NOT_FOUND',
      status: 404,
    });
  });

  it('maps upstream failures and invalid payloads to CATALOG_UNAVAILABLE', async () => {
    const unavailable = new TmdbCatalogAdapter(config(), () =>
      Promise.resolve(jsonResponse({}, 503)),
    );
    const invalidPayload = new TmdbCatalogAdapter(config(), () =>
      Promise.resolve(jsonResponse({ results: null })),
    );

    await expect(unavailable.nowPlaying(1)).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
      status: 502,
    });
    await expect(invalidPayload.nowPlaying(1)).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
      status: 502,
    });
  });

  it('maps an aborted request to CATALOG_TIMEOUT', async () => {
    const fetcher: TmdbFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    const adapter = new TmdbCatalogAdapter(config(), fetcher);

    await expect(adapter.nowPlaying(1)).rejects.toMatchObject({
      code: 'CATALOG_TIMEOUT',
      status: 504,
    });
  });

  it('keeps the API available but rejects catalog calls without a token', async () => {
    let called = false;
    const fetcher: TmdbFetch = () => {
      called = true;
      return Promise.resolve(jsonResponse({}));
    };
    const adapter = new TmdbCatalogAdapter(
      new ConfigService({ TMDB_API_READ_TOKEN: '' }),
      fetcher,
    );

    await expect(adapter.nowPlaying(1)).rejects.toBeInstanceOf(ApiException);
    await expect(adapter.nowPlaying(1)).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
      status: 502,
    });
    expect(called).toBe(false);
  });
});
