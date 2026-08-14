import { IsUUID } from 'class-validator';

export class EventParamsDto {
  @IsUUID('4', { message: 'O identificador do evento é inválido.' })
  eventId!: string;
}
