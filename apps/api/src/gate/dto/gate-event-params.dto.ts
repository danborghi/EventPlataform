import { IsUUID } from 'class-validator';

export class GateEventParamsDto {
  @IsUUID('4', { message: 'O evento deve ser um UUID válido.' })
  eventId!: string;
}
