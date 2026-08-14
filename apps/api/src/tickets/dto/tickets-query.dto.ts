import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { TicketStatus } from '@event-platform/contracts';

export class TicketsQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'A página deve ser um número inteiro.' })
  @Min(1, { message: 'A página deve ser maior ou igual a 1.' })
  @Max(500, { message: 'A página deve ser menor ou igual a 500.' })
  page = 1;

  @IsOptional()
  @IsIn(['VALID', 'USED', 'CANCELED'], {
    message: 'O status deve ser VALID, USED ou CANCELED.',
  })
  status?: TicketStatus;
}
