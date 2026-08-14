import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class CatalogPaginationQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'A página deve ser um número inteiro.' })
  @Min(1, { message: 'A página deve ser maior ou igual a 1.' })
  @Max(500, { message: 'A página deve ser menor ou igual a 500.' })
  page = 1;
}
