import type {
  CatalogMovieDetail,
  CatalogMovieListResponse,
} from '@event-platform/contracts';
import { Injectable } from '@nestjs/common';
import { TmdbCatalogAdapter } from './tmdb-catalog.adapter.js';

@Injectable()
export class CatalogService {
  constructor(private readonly tmdb: TmdbCatalogAdapter) {}

  searchMovies(query: string, page: number): Promise<CatalogMovieListResponse> {
    return this.tmdb.searchMovies(query, page);
  }

  nowPlaying(page: number): Promise<CatalogMovieListResponse> {
    return this.tmdb.nowPlaying(page);
  }

  movieDetails(externalId: string): Promise<CatalogMovieDetail> {
    return this.tmdb.movieDetails(externalId);
  }
}
