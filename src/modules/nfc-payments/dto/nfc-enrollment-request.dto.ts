import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NfcEnrollmentRequestDto {
  @ApiProperty({
    description: 'Base64-encoded ECDH P-256 public key from the device',
    example: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
  })
  @IsString()
  @IsNotEmpty()
  devicePublicKey: string;
}
