export interface TmdbMovieListItem {
  id?: unknown;
  title?: unknown;
  original_title?: unknown;
  overview?: unknown;
  poster_path?: unknown;
  release_date?: unknown;
}

export interface TmdbMovieListPayload {
  page?: unknown;
  results?: unknown;
  total_pages?: unknown;
  total_results?: unknown;
}

export interface TmdbGenre {
  name?: unknown;
}

export interface TmdbMovieDetailPayload extends TmdbMovieListItem {
  genres?: unknown;
  runtime?: unknown;
}
