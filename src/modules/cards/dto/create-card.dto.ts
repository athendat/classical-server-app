import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Min,
  Max,
  IsEnum,
  Length,
  IsInt,
  IsNotEmpty,
} from 'class-validator';
import { IsLuhnCard } from 'src/common/validators/luhn.validator';
import { CardTypeEnum } from '../domain/enums/card-type.enum';

export class CreateCardDto {
  @ApiProperty({
    description: 'Número de tarjeta (PAN). Debe pasar la validación Luhn.',
    example: '4242424242424242',
    required: true,
    type: String,
  })
  @IsLuhnCard({ message: 'PAN inválido. No cumple el algoritmo Luhn.' })
  pan: string;

  @ApiProperty({
    description: 'PIN de la tarjeta (cadena).',
    example: '1234',
    required: true,
    type: String,
  })
  @IsString({ message: 'El PIN debe ser una cadena de texto.' })
  @Length(4, 4, { message: 'El PIN debe tener exactamente 4 dígitos.' })
  pin: string;

  @ApiProperty({
    description: 'Mes de expiración (1-12).',
    example: 12,
    minimum: 1,
    maximum: 12,
    required: true,
    type: Number,
  })
  @IsInt({ message: 'El mes de expiración debe ser un número.' })
  @Min(1, { message: 'El mes de expiración debe ser como mínimo 1.' })
  @Max(12, { message: 'El mes de expiración debe ser como máximo 12.' })
  expiryMonth: number;

  @ApiProperty({
    description: 'Año de expiración (por ejemplo, 26).',
    example: 26,
    minimum: 26,
    maximum: 99,
    required: true,
    type: Number,
  })
  @IsInt({ message: 'El año de expiración debe ser un número.' })
  @Min(26, { message: 'El año de expiración debe ser como mínimo 26.' })
  @Max(99, { message: 'El año de expiración debe ser como máximo 99.' })
  expiryYear: number;

  @ApiProperty({
    description: 'Tipo de tarjeta. Valores permitidos según CardTypeEnum.',
    example: Object.values(CardTypeEnum)[0],
    enum: CardTypeEnum,
    required: true,
  })
  @IsEnum(CardTypeEnum, { message: 'Tipo de tarjeta inválido.' })
  cardType: CardTypeEnum;

  @ApiProperty({
    description: 'Referencia de ticket asociada a la creación de la tarjeta.',
    example: 'TICKET-123456',
    required: true,
    type: String,
  })
  @IsNotEmpty({ message: 'La referencia de ticket no debe estar vacía.' })
  @IsString({
    message: 'La referencia de ticket debe ser una cadena de texto.',
  })
  ticketReference: string;
}
