import type { CreateOrganizerEventRequest } from '@event-platform/contracts';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EventScheduleFields, trimString } from './event-fields.js';

export class CreateOrganizerEventDto
  extends EventScheduleFields
  implements CreateOrganizerEventRequest
{
  @IsIn(['TMDB'], { message: 'O provedor externo deve ser TMDB.' })
  externalProvider!: 'TMDB';

  @IsString({ message: 'O identificador externo deve ser um texto.' })
  @Matches(/^[1-9]\d*$/, { message: 'O identificador do filme é inválido.' })
  @MaxLength(10, { message: 'O identificador do filme é inválido.' })
  externalId!: string;

  @Transform(trimString)
  @IsString({ message: 'O título deve ser um texto.' })
  @MinLength(2, { message: 'O título deve ter pelo menos 2 caracteres.' })
  @MaxLength(120, { message: 'O título deve ter no máximo 120 caracteres.' })
  title!: string;
}
