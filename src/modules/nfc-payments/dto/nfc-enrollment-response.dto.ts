import { ApiProperty } from '@nestjs/swagger';

export class NfcEnrollmentResponseDto {
  @ApiProperty({
    description: 'Base64-encoded ECDH P-256 server public key for shared secret derivation',
    example: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
  })
  serverPublicKey: string;

  @ApiProperty({
    description: 'Transaction counter, always 0 on fresh enrollment',
    example: 0,
  })
  counter: number;
}
