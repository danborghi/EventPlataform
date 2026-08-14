import { IsUUID } from 'class-validator';

export class ReservationParamsDto {
  @IsUUID('4', { message: 'A reserva deve ser um UUID válido.' })
  reservationId!: string;
}
