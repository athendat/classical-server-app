import { IsString, IsNotEmpty } from 'class-validator';

export class NfcEnrollmentRequestDto {
  @IsString()
  @IsNotEmpty()
  devicePublicKey: string; // Base64
}
