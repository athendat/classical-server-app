/**
 * DTO: AuthorizePaymentRequestDto
 *
 * Request body for the NFC payment authorization endpoint.
 * Contains the signed TLV payload from the phone and POS-provided amount/currency.
 */

import { IsString, IsNumber } from 'class-validator';

export class AuthorizePaymentRequestDto {
  @IsString()
  signedPayload: string; // Hex-encoded TLV payload from the phone

  @IsNumber()
  amount: number; // Amount in minor units (cents) — from POS

  @IsString()
  currency: string; // ISO 4217 — from POS
}
