import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { TMDB_FETCH } from './tmdb-fetch.token.js';
import { TmdbCatalogAdapter } from './tmdb-catalog.adapter.js';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    TmdbCatalogAdapter,
    { provide: TMDB_FETCH, useValue: globalThis.fetch.bind(globalThis) },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
