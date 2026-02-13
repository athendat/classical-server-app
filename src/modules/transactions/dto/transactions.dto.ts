import { IsString, IsNumber, IsOptional, Max, Min, IsUUID, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transaction } from '../domain/entities/transaction.entity';

/**
 * DTO para crear una transacción
 * Cliente envía: ref (su número de orden), amount, ttlMinutes, intentId
 */
export class CreateTransactionDto {

  /**
   * ID de intención de transacción (UUID v4 para idempotencia)
   */
  @ApiProperty({
    description: 'ID de intención único (UUID v4) para evitar duplicados en reintentos',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID('4', { message: 'intentId debe ser un UUID versión 4 válido' })
  intentId: string;

  /**
   * Referencia del cliente (número de orden)
   */
  @ApiProperty({
    description: 'Referencia del cliente (número de orden)',
    example: 'ORD-2025-0001',
  })
  @IsString({ message: 'ref debe ser una cadena de texto (referencia del cliente)' })
  ref: string;

  /**
   * Monto en centavos
   */
  @ApiProperty({
    description: 'Monto en centavos (entero, mínimo 1)',
    example: 1500,
  })
  @IsInt({ message: 'amount debe ser un número entero (en centavos)' })
  @Min(1, { message: 'amount debe ser como mínimo 1 (centavo)' })
  amount: number;

  /**
   * Tiempo de vida en minutos (máximo 1440 = 24 horas)
   */
  @ApiPropertyOptional({
    description: 'Tiempo de vida de la transacción en minutos (máximo 1440 = 24 horas)',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsNumber({}, { message: 'ttlMinutes debe ser un número (minutos)' })
  @Min(1, { message: 'ttlMinutes debe ser al menos 1 minuto' })
  @Max(1440, { message: 'ttlMinutes no puede exceder 1440 minutos (24 horas)' })
  ttlMinutes?: number;
}

/**
 * DTO para confirmar una transacción
 * Cliente envía: cardId, firma del QR para validar integridad
 */
export class ConfirmTransactionDto {
  @ApiProperty({
    description: 'ID de la transacción (UUID v4)',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID('4', { message: 'transactionId debe ser un UUID versión 4 válido' })
  transactionId: string;

  @ApiProperty({
    description: 'ID de la tarjeta que confirma la transacción',
    example: 'card_789',
  })
  @IsUUID('4', { message: 'cardId debe ser un UUID versión 4 válido' })
  cardId: string;

  /**
   * Firma HMAC-SHA256 del payload del QR
   * Cliente recibe esto en la respuesta de creación
   */
  @ApiProperty({
    description: 'Firma HMAC-SHA256 del payload del QR (debe coincidir con la enviada en creación)',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString({ message: 'signature debe ser una cadena (firma HMAC-SHA256)' })
  signature: string;
}

/**
 * DTO para cancelar una transacción
 * No requiere datos adicionales, la URL tiene el ID
 */
export class CancelTransactionDto {}


/**
 * DTO para respuesta al crear transacción
 * Cliente recibe los datos del QR con la firma
 */
export class CreateTransactionResponseDto {
  @ApiProperty({
    description: 'ID de la transacción creada',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  id: string;

  @ApiProperty({
    description: 'ID de intención (UUID v4) que fue enviado en la creación',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  intentId: string;

  @ApiProperty({
    description: 'Referencia del cliente (número de orden) enviada originalmente',
    example: 'ORD-2025-0001',
  })
  ref: string;

  @ApiProperty({
    description: 'Número interno de transacción',
    example: 1024,
  })
  no: number;

  @ApiProperty({
    description: 'Nombre del tenant al que pertenece la transacción',
    example: 'Tenant ABC',
  })
  tenantName: string;

  @ApiProperty({
    description: 'Monto en centavos',
    example: 1500,
  })
  amount: number;

  @ApiProperty({
    description: 'Fecha y hora de expiración de la transacción en formato ISO',
    example: new Date().toISOString(),
    type: String,
    format: 'date-time',
  })
  expiresAt: Date;

  /**
   * Payload del QR en JSON para que cliente lo escanee
   */
  @ApiProperty({
    description: 'Payload JSON codificado en el QR que el cliente debe escanear',
    type: String,
    example: '0002010102121515Mi Empresa S.A.5204531153031705404150062840113ORD-2025-0001053620e6422b-a238-4b1d-8da5-8cc876677afd0701809242026-02-05T17:03:05.538Z6304E8A2',
  })
  emvco: string;

  /**
   * Firma HMAC-SHA256 del payload, cliente debe devolverla en confirmación
   */
  @ApiProperty({
    description: 'Firma HMAC-SHA256 del payload del QR (debe devolverse en la confirmación)',
    example: 'a1b2c3d4e5f6...',
  })
  signature: string;
}


/**
 * DTO para respuesta paginada de transactions
 */
export class TransactionPaginatedResponseDto {
  @ApiProperty({
    description: 'Array de transactions',
    type: [Transaction],
  })
  data: Transaction[];

  @ApiProperty({
    description: 'Metadatos de paginación',
    example: {
      page: 1,
      limit: 10,
      total: 50,
      totalPages: 5,
      hasNextPage: true,
      hasPreviousPage: false,
    },
  })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}