import { Transform, type TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CatalogPaginationQueryDto } from './catalog-pagination-query.dto.js';

export class SearchMoviesQueryDto extends CatalogPaginationQueryDto {
  @Transform(({ value }: TransformFnParams): unknown => {
    const query: unknown = value;

    return typeof query === 'string' ? query.trim() : query;
  })
  @IsString({ message: 'A busca deve ser um texto.' })
  @MinLength(2, { message: 'A busca deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'A busca deve ter no máximo 100 caracteres.' })
  q!: string;
}
