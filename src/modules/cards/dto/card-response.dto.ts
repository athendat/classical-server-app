import { ApiProperty } from '@nestjs/swagger';
import { CardStatusEnum } from '../domain/enums/card-status.enum';
import { CardTypeEnum } from '../domain/enums/card-type.enum';
import { Transaction } from 'src/modules/transactions/domain/entities/transaction.entity';

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

  @ApiProperty({
    description:
      'Lista de las últimas transacciones asociadas a la tarjeta.',
  })
  lastTransactions: LastTransactionsDtoResponse[];
}

/**
 * DTO que representa una transacción breve asociada a una tarjeta.
 *
 * Proporciona los campos principales que se incluyen en la lista de últimas
 * transacciones retornadas junto con la información de la tarjeta.
 */
export class LastTransactionsDtoResponse {
  /**
   * Identificador único de la transacción (UUID v4).
   * @example '3fa85f64-5717-4562-b3fc-2c963f66afa6'
   */
  @ApiProperty({
    description: 'Identificador único de la transacción (UUID v4).',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    type: String,
    format: 'uuid',
    required: true,
  })
  id: string;

  /**
   * Referencia externa o interna de la transacción (por ejemplo: número de factura o referencia bancaria).
   * @example 'INV-202401-0001'
   */
  @ApiProperty({
    description:
      'Referencia externa o interna de la transacción (por ejemplo: número de factura o referencia bancaria).',
    example: 'INV-202401-0001',
    type: String,
    maxLength: 64,
    required: true,
  })
  ref: string;

  /**
   * Número secuencial de la transacción relativo al registro (por ejemplo, índice o número de orden).
   * @example 1
   */
  @ApiProperty({
    description:
      'Número secuencial de la transacción relativo al registro (por ejemplo, índice o número de orden).',
    example: 1,
    type: Number,
    format: 'int32',
    minimum: 0,
    required: true,
  })
  no: number;

  /**
   * Nombre del tenant o cliente propietario de la tarjeta.
   * @example 'Empresa S.A.'
   */
  @ApiProperty({
    description: 'Nombre del tenant o cliente propietario de la tarjeta.',
    example: 'Empresa S.A.',
    type: String,
    maxLength: 128,
    required: true,
  })
  tenantName: string;

  /**
   * Identificador de la tarjeta asociada a la transacción (UUID v4).
   * @example '3fa85f64-5717-4562-b3fc-2c963f66afa6'
   */
  @ApiProperty({
    description: 'Identificador de la tarjeta asociada a la transacción (UUID v4).',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    type: String,
    format: 'uuid',
    required: true,
  })
  cardId: string;

  /**
   * Fecha y hora en que se creó la transacción en formato ISO 8601.
   * @example '2024-01-15T10:20:30Z'
   */
  @ApiProperty({
    description: 'Fecha y hora en que se creó la transacción en formato ISO 8601.',
    example: '2024-01-15T10:20:30Z',
    type: String,
    format: 'date-time',
    required: true,
  })
  createdAt: Date;

  /**
   * Monto de la transacción. Representado en la unidad mayor de la moneda con dos decimales.
   * @example 49.99
   */
  @ApiProperty({
    description:
      'Monto de la transacción. Representado en la unidad mayor de la moneda con dos decimales.',
    example: 49.99,
    type: Number,
    format: 'double',
    minimum: 0,
    required: true,
  })
  amount: number;
}