export class NfcEnrollmentResponseDto {
  serverPublicKey: string; // Base64
  counter: number; // Always 0 on fresh enrollment
}
