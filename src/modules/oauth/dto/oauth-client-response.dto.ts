import { ApiProperty } from '@nestjs/swagger';

export class OAuthClientResponseDto {
  @ApiProperty()
  clientId: string;

  @ApiProperty()
  merchantId: string;

  @ApiProperty()
  terminalName: string;

  @ApiProperty({ type: [String] })
  scopes: string[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ required: false })
  revokedAt?: Date;

  @ApiProperty({ required: false })
  createdAt?: Date;
}

export class CreateClientResponseDto {
  @ApiProperty()
  clientId: string;

  @ApiProperty({ description: 'Plaintext secret (shown only once)' })
  clientSecret: string;
}

export class TokenResponseDto {
  @ApiProperty()
  access_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: string;

  @ApiProperty({ example: 28800 })
  expires_in: number;

  @ApiProperty()
  scope: string;
}
