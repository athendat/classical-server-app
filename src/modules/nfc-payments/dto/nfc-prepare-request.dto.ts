import { IsString, IsNotEmpty } from 'class-validator';

export class NfcPrepareRequestDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;
}
