import type { CreateReservationRequest } from '@event-platform/contracts';
import { IsInt, IsUUID } from 'class-validator';

export class CreateReservationDto implements CreateReservationRequest {
  @IsUUID('4', { message: 'O evento deve ser um UUID válido.' })
  eventId!: string;

  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  quantity!: number;
}
