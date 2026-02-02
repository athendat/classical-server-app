import { ApiProperty } from '@nestjs/swagger';
import { CardStatusEnum } from '../domain/enums/card-status.enum';
import { CardTypeEnum } from '../domain/enums/card-type.enum';

export class CardResponseDto {
  @ApiProperty({
    description: 'Identificador único de la tarjeta (UUID v4).',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    type: String,
    format: 'uuid',
    required: true,
  })
  id: string;

  @ApiProperty({
    description:
      'PAN enmascarado para display/pago seguro. Formatos comunes: "**** **** **** 1234" o "1234********5678".',
    example: '**** **** **** 1234',
    type: String,
    maxLength: 23,
    required: true,
  })
  maskedPan: string;

  @ApiProperty({
    description:
      'Mes de expiración de la tarjeta (valor numérico entre 1 y 12).',
    example: 12,
    type: Number,
    format: 'int32',
    minimum: 1,
    maximum: 12,
    required: true,
  })
  expiryMonth: number;

  @ApiProperty({
    description: 'Año de expiración en formato YYYY (por ejemplo, 2028).',
    example: 2028,
    type: Number,
    format: 'int32',
    minimum: 2000,
    maximum: 2100,
    required: true,
  })
  expiryYear: number;

  @ApiProperty({
    description:
      'Tipo de tarjeta según la enumeración del dominio (por ejemplo: DEBIT, CREDIT, VIRTUAL).',
    example: 'DEBIT',
    enum: CardTypeEnum,
    required: true,
  })
  cardType: CardTypeEnum;

  @ApiProperty({
    description:
      'Saldo disponible en la tarjeta. Se recomienda representar en la unidad monetaria mayor con dos decimales (ej. 150.75).',
    example: 150.75,
    type: Number,
    format: 'double',
    minimum: 0,
    required: true,
  })
  balance: number;

  @ApiProperty({
    description:
      'Estado de la tarjeta según la enumeración del dominio (por ejemplo: ACTIVE, BLOCKED, EXPIRED).',
    example: 'ACTIVE',
    enum: CardStatusEnum,
    required: true,
  })
  status: CardStatusEnum;

  @ApiProperty({
    description: 'Fecha y hora de creación de la tarjeta en formato ISO 8601.',
    example: '2024-01-15T10:20:30Z',
    type: String,
    format: 'date-time',
    required: true,
  })
  createdAt: Date;
}
