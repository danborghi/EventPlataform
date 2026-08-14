import { Transform, type TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateTicketDto {
  @Transform(({ value }: TransformFnParams): unknown => {
    const code: unknown = value;
    return typeof code === 'string' ? code.trim() : code;
  })
  @IsString({ message: 'O código deve ser um texto.' })
  @MinLength(1, { message: 'Informe o código do ingresso.' })
  @MaxLength(4096, { message: 'O código informado é muito longo.' })
  code!: string;
}
