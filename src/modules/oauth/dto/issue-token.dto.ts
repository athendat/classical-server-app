import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OAUTH_CONSTANTS } from '../domain/constants/oauth.constants';

export class IssueTokenDto {
  @ApiProperty({ description: 'Grant type (must be client_credentials)' })
  @IsString()
  @IsNotEmpty()
  @IsIn([OAUTH_CONSTANTS.GRANT_TYPE])
  grant_type: string;

  @ApiProperty({ description: 'OAuth client ID' })
  @IsString()
  @IsNotEmpty()
  client_id: string;

  @ApiProperty({ description: 'OAuth client secret' })
  @IsString()
  @IsNotEmpty()
  client_secret: string;

  @ApiPropertyOptional({
    description: 'Space-separated list of requested scopes',
  })
  @IsOptional()
  @IsString()
  scope?: string;
}
