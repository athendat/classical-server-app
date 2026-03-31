/**
 * DTO: AuthorizePaymentResponseDto
 *
 * Response body for the NFC payment authorization endpoint.
 */

export class AuthorizePaymentResponseDto {
  approved: boolean;
  txId?: string;
  amount?: number;
  currency?: string;
  reason?: string;
}
