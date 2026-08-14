import { IsString, Matches, MaxLength } from 'class-validator';

export class MovieParamsDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'O identificador do filme é inválido.' })
  @MaxLength(10, { message: 'O identificador do filme é inválido.' })
  externalId!: string;
}
