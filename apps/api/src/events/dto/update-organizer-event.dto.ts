import type { UpdateOrganizerEventRequest } from '@event-platform/contracts';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trimString } from './event-fields.js';

const ISO_WITH_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;

export class UpdateOrganizerEventDto implements UpdateOrganizerEventRequest {
  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'A data de início deve estar em ISO 8601.' },
  )
  @Matches(ISO_WITH_OFFSET, {
    message: 'A data de início deve informar o offset.',
  })
  startsAt?: string;

  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'A data de término deve estar em ISO 8601.' },
  )
  @Matches(ISO_WITH_OFFSET, {
    message: 'A data de término deve informar o offset.',
  })
  endsAt?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'O fuso deve ser um texto.' })
  @MinLength(1, { message: 'Informe o fuso do evento.' })
  @MaxLength(64, { message: 'O fuso deve ter no máximo 64 caracteres.' })
  timezone?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'O nome do local deve ser um texto.' })
  @MinLength(2, {
    message: 'O nome do local deve ter pelo menos 2 caracteres.',
  })
  @MaxLength(160, {
    message: 'O nome do local deve ter no máximo 160 caracteres.',
  })
  venueName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'O endereço deve ser um texto.' })
  @MinLength(2, { message: 'O endereço deve ter pelo menos 2 caracteres.' })
  @MaxLength(255, { message: 'O endereço deve ter no máximo 255 caracteres.' })
  address?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'A cidade deve ser um texto.' })
  @MinLength(2, { message: 'A cidade deve ter pelo menos 2 caracteres.' })
  @MaxLength(120, { message: 'A cidade deve ter no máximo 120 caracteres.' })
  city?: string;

  @IsOptional()
  @IsInt({ message: 'A capacidade deve ser um número inteiro.' })
  @Min(1, { message: 'A capacidade deve ser maior ou igual a 1.' })
  @Max(100_000, { message: 'A capacidade deve ser menor ou igual a 100000.' })
  capacity?: number;

  @IsOptional()
  @IsInt({ message: 'O preço deve ser um inteiro em centavos.' })
  @Min(100, { message: 'O preço deve ser maior ou igual a 100 centavos.' })
  @Max(100_000_000, {
    message: 'O preço deve ser menor ou igual a 100000000 centavos.',
  })
  priceCents?: number;
}
