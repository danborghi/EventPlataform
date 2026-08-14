import { IsUUID } from 'class-validator';

export class TicketParamsDto {
  @IsUUID('4', { message: 'O ingresso deve ser um UUID válido.' })
  ticketId!: string;
}
