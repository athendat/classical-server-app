/**
 * DTO: AuthorizePaymentResponseDto
 *
 * Response body for the NFC payment authorization endpoint.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthorizePaymentResponseDto {
  @ApiProperty({
    description: 'Whether the payment was approved',
    example: true,
  })
  approved: boolean;

  @ApiPropertyOptional({
    description: 'Transaction ID assigned to the approved payment',
    example: '660e8400-e29b-41d4-a716-446655440000',
  })
  txId?: string;

  @ApiPropertyOptional({
    description: 'Authorized amount in minor units (cents)',
    example: 1500,
  })
  amount?: number;

  @ApiPropertyOptional({
    description: 'ISO 4217 currency code of the transaction',
    example: 'USD',
  })
  currency?: string;

  @ApiPropertyOptional({
    description: 'Reason for rejection if payment was not approved',
    example: 'Insufficient funds',
  })
  reason?: string;
}
