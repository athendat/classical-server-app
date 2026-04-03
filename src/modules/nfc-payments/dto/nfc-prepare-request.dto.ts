import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NfcPrepareRequestDto {
  @ApiProperty({
    description: 'Unique identifier of the card to prepare for NFC payment',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  cardId: string;
}
