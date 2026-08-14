import type {
  CatalogMovieDetail,
  CatalogMovieListResponse,
} from '@event-platform/contracts';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CatalogService } from './catalog.service.js';
import { CatalogPaginationQueryDto } from './dto/catalog-pagination-query.dto.js';
import { MovieParamsDto } from './dto/movie-params.dto.js';
import { SearchMoviesQueryDto } from './dto/search-movies-query.dto.js';

@Controller('catalog/movies')
@ApiTags('Catalog')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  search(
    @Query() query: SearchMoviesQueryDto,
  ): Promise<CatalogMovieListResponse> {
    return this.catalogService.searchMovies(query.q, query.page);
  }

  @Get('now-playing')
  nowPlaying(
    @Query() query: CatalogPaginationQueryDto,
  ): Promise<CatalogMovieListResponse> {
    return this.catalogService.nowPlaying(query.page);
  }

  @Get(':externalId')
  details(@Param() params: MovieParamsDto): Promise<CatalogMovieDetail> {
    return this.catalogService.movieDetails(params.externalId);
  }
}
