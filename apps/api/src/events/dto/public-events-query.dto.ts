import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PublicEventsQueryDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    const query: unknown = value;
    return typeof query === 'string' ? query.trim() : query;
  })
  @IsString({ message: 'A busca deve ser um texto.' })
  @MinLength(2, { message: 'A busca deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'A busca deve ter no máximo 100 caracteres.' })
  q?: string;

  @Type(() => Number)
  @IsInt({ message: 'A página deve ser um número inteiro.' })
  @Min(1, { message: 'A página deve ser maior ou igual a 1.' })
  @Max(500, { message: 'A página deve ser menor ou igual a 500.' })
  page = 1;

  @Type(() => Number)
  @IsInt({ message: 'O tamanho da página deve ser um número inteiro.' })
  @Min(1, { message: 'O tamanho da página deve ser maior ou igual a 1.' })
  @Max(50, { message: 'O tamanho da página deve ser menor ou igual a 50.' })
  pageSize = 12;
}
