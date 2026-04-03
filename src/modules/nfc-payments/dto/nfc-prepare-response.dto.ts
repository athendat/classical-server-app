import { ApiProperty } from '@nestjs/swagger';

export class NfcPrepareResponseDto {
  @ApiProperty({
    description: 'Random nonce for this payment session',
    example: 'a1b2c3d4e5f6...',
  })
  nonce: string;

  @ApiProperty({
    description: 'Current transaction counter for replay protection',
    example: 5,
  })
  counter: number;

  @ApiProperty({
    description: 'Server timestamp in milliseconds (Unix epoch)',
    example: 1711987200000,
  })
  serverTimestamp: number;

  @ApiProperty({
    description: 'Unique session identifier for this payment session',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sessionId: string;
}
