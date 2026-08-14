import type {
  CatalogMovieDetail,
  CatalogMovieListResponse,
  CatalogMovieSummary,
} from '@event-platform/contracts';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../common/errors/api.exception.js';
import {
  readTmdbConfiguration,
  type TmdbConfiguration,
} from './catalog.config.js';
import { TMDB_FETCH, type TmdbFetch } from './tmdb-fetch.token.js';
import type {
  TmdbMovieDetailPayload,
  TmdbMovieListItem,
  TmdbMovieListPayload,
} from './tmdb.types.js';

const TMDB_PAGE_SIZE = 20;

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

@Injectable()
export class TmdbCatalogAdapter {
  constructor(
    private readonly configService: ConfigService,
    @Inject(TMDB_FETCH) private readonly fetcher: TmdbFetch,
  ) {}

  async searchMovies(
    query: string,
    page: number,
  ): Promise<CatalogMovieListResponse> {
    const config = this.configuration();
    const payload = await this.request<TmdbMovieListPayload>(
      config,
      'search/movie',
      {
        query,
        page: String(page),
        language: config.language,
        include_adult: 'false',
      },
    );

    return this.normalizeList(payload, config);
  }

  async nowPlaying(page: number): Promise<CatalogMovieListResponse> {
    const config = this.configuration();
    const payload = await this.request<TmdbMovieListPayload>(
      config,
      'movie/now_playing',
      {
        page: String(page),
        language: config.language,
        region: config.region,
      },
    );

    return this.normalizeList(payload, config);
  }

  async movieDetails(externalId: string): Promise<CatalogMovieDetail> {
    const config = this.configuration();
    const payload = await this.request<TmdbMovieDetailPayload>(
      config,
      `movie/${externalId}`,
      { language: config.language },
      true,
    );

    if (
      typeof payload.id !== 'number' ||
      !Number.isInteger(payload.id) ||
      typeof payload.title !== 'string'
    ) {
      throw this.unavailable();
    }

    const summary = this.normalizeMovie(payload, config);

    if (!summary) {
      throw this.unavailable();
    }

    const genres = isUnknownArray(payload.genres)
      ? payload.genres.flatMap((genre) => {
          if (
            typeof genre === 'object' &&
            genre !== null &&
            'name' in genre &&
            typeof genre.name === 'string'
          ) {
            return [genre.name];
          }

          return [];
        })
      : [];
    const runtimeMinutes =
      typeof payload.runtime === 'number' &&
      Number.isInteger(payload.runtime) &&
      payload.runtime > 0
        ? payload.runtime
        : null;

    return { ...summary, runtimeMinutes, genres };
  }

  private configuration(): TmdbConfiguration {
    const config = readTmdbConfiguration(this.configService);

    if (!config.apiReadToken) {
      throw this.unavailable();
    }

    return config;
  }

  private async request<T>(
    config: TmdbConfiguration,
    path: string,
    parameters: Record<string, string>,
    itemRequest = false,
  ): Promise<T> {
    const url = new URL(`${config.apiBaseUrl}/${path}`);

    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);
    timeout.unref();

    try {
      const response = await this.fetcher(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.apiReadToken}`,
        },
        signal: abortController.signal,
      });

      if (itemRequest && response.status === 404) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          'CATALOG_ITEM_NOT_FOUND',
          'Filme não encontrado no catálogo.',
        );
      }

      if (response.status === 504) {
        throw this.timeout();
      }

      if (!response.ok) {
        throw this.unavailable();
      }

      try {
        return (await response.json()) as T;
      } catch {
        throw this.unavailable();
      }
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }

      if (abortController.signal.aborted) {
        throw this.timeout();
      }

      throw this.unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeList(
    payload: TmdbMovieListPayload,
    config: TmdbConfiguration,
  ): CatalogMovieListResponse {
    if (!isUnknownArray(payload.results)) {
      throw this.unavailable();
    }

    const data = payload.results.flatMap((movie) => {
      const normalized = this.normalizeMovie(
        movie as TmdbMovieListItem,
        config,
      );
      return normalized ? [normalized] : [];
    });
    const page = this.nonNegativeInteger(payload.page, 1);
    const total = this.nonNegativeInteger(payload.total_results, data.length);
    const totalPages = this.nonNegativeInteger(
      payload.total_pages,
      Math.ceil(total / TMDB_PAGE_SIZE),
    );

    return {
      data,
      meta: { page, pageSize: TMDB_PAGE_SIZE, total, totalPages },
    };
  }

  private normalizeMovie(
    movie: TmdbMovieListItem,
    config: TmdbConfiguration,
  ): CatalogMovieSummary | null {
    if (
      typeof movie.id !== 'number' ||
      !Number.isInteger(movie.id) ||
      typeof movie.title !== 'string'
    ) {
      return null;
    }

    return {
      externalProvider: 'TMDB',
      externalId: String(movie.id),
      title: movie.title,
      originalTitle:
        typeof movie.original_title === 'string'
          ? movie.original_title
          : movie.title,
      overview: typeof movie.overview === 'string' ? movie.overview : '',
      posterUrl:
        typeof movie.poster_path === 'string' && movie.poster_path
          ? `${config.imageBaseUrl}/${movie.poster_path.replace(/^\//, '')}`
          : null,
      releaseDate:
        typeof movie.release_date === 'string' && movie.release_date
          ? movie.release_date
          : null,
    };
  }

  private nonNegativeInteger(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : fallback;
  }

  private unavailable(): ApiException {
    return new ApiException(
      HttpStatus.BAD_GATEWAY,
      'CATALOG_UNAVAILABLE',
      'O catálogo de filmes está indisponível no momento.',
    );
  }

  private timeout(): ApiException {
    return new ApiException(
      HttpStatus.GATEWAY_TIMEOUT,
      'CATALOG_TIMEOUT',
      'O catálogo de filmes demorou para responder.',
    );
  }
}
