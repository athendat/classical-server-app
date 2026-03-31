import { IsString, IsNotEmpty, IsArray, ArrayNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OAUTH_CONSTANTS } from '../domain/constants/oauth.constants';

export class CreateClientDto {
  @ApiProperty({ description: 'Merchant ID that owns this client' })
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @ApiProperty({ description: 'Terminal name for identification' })
  @IsString()
  @IsNotEmpty()
  terminalName: string;

  @ApiProperty({
    description: 'Scopes to grant to this client',
    enum: OAUTH_CONSTANTS.VALID_SCOPES,
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(OAUTH_CONSTANTS.VALID_SCOPES, { each: true })
  scopes: string[];
}
