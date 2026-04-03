/**
 * DTO: AuthorizePaymentRequestDto
 *
 * Request body for the NFC payment authorization endpoint.
 * Contains the signed TLV payload from the phone and POS-provided amount/currency.
 */

import { IsString, IsNumber, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthorizePaymentRequestDto {

  /**
   * ID de intención de transacción (UUID v4 para idempotencia)
   */
  @ApiProperty({
    description: 'ID de intención único (UUID v4) para evitar duplicados en reintentos',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID('4', { message: 'intentId debe ser un UUID versión 4 válido' })
  intentId: string;


  @ApiProperty({
    description: 'Hex-encoded signed TLV payload from the phone',
    example: '9f0206000000001000...',
  })
  @IsString()
  signedPayload: string;

  @ApiProperty({
    description: 'Transaction amount in minor units (cents)',
    example: 1500,
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: 'ISO 4217 currency code',
    example: 'USD',
  })
  @IsString()
  currency: string;
}
