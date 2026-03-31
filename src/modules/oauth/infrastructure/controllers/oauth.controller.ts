import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { OAuthService } from '../../application/oauth.service';
import { CreateClientDto } from '../../dto/create-client.dto';
import { IssueTokenDto } from '../../dto/issue-token.dto';
import {
  CreateClientResponseDto,
  OAuthClientResponseDto,
  TokenResponseDto,
} from '../../dto/oauth-client-response.dto';

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Post('clients')
  @ApiOperation({ summary: 'Register a new OAuth client' })
  @ApiCreatedResponse({ type: CreateClientResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  async createClient(
    @Body() dto: CreateClientDto,
  ): Promise<CreateClientResponseDto> {
    return this.oauthService.createClient(
      dto.merchantId,
      dto.terminalName,
      dto.scopes,
    );
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue an access token (Client Credentials Grant)' })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async issueToken(@Body() dto: IssueTokenDto): Promise<TokenResponseDto> {
    const requestedScopes = dto.scope
      ? dto.scope.split(' ').filter(Boolean)
      : undefined;

    return this.oauthService.issueToken(
      dto.client_id,
      dto.client_secret,
      requestedScopes,
    );
  }

  @Delete('clients/:clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an OAuth client' })
  async revokeClient(
    @Param('clientId') clientId: string,
    @Query('merchantId') merchantId: string,
  ): Promise<void> {
    await this.oauthService.revokeClient(clientId, merchantId);
  }

  @Get('clients')
  @ApiOperation({ summary: 'List OAuth clients for a merchant' })
  @ApiOkResponse({ type: [OAuthClientResponseDto] })
  async listClients(
    @Query('merchantId') merchantId: string,
  ): Promise<OAuthClientResponseDto[]> {
    return this.oauthService.listClients(merchantId) as Promise<
      OAuthClientResponseDto[]
    >;
  }
}
