import type { EventStatus } from '@event-platform/contracts';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class OrganizerEventsQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'CANCELED'], {
    message: 'O status do evento é inválido.',
  })
  status?: EventStatus;

  @Type(() => Number)
  @IsInt({ message: 'A página deve ser um número inteiro.' })
  @Min(1, { message: 'A página deve ser maior ou igual a 1.' })
  @Max(500, { message: 'A página deve ser menor ou igual a 500.' })
  page = 1;
}
