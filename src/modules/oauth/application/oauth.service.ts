import { Injectable, Inject, UnauthorizedException, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';

import type { IOAuthClientRepository } from '../domain/ports/oauth-client-repository.port';
import type { IJwtTokenPort } from '../../auth/domain/ports/jwt-token.port';
import { OAUTH_CONSTANTS, OAUTH_INJECTION_TOKENS } from '../domain/constants/oauth.constants';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;

  constructor(
    @Inject(OAUTH_INJECTION_TOKENS.OAUTH_CLIENT_REPOSITORY)
    private readonly oauthClientRepository: IOAuthClientRepository,
    @Inject('IJwtTokenPort')
    private readonly jwtTokenPort: IJwtTokenPort,
    private readonly configService: ConfigService,
  ) {
    this.jwtIssuer = configService.get<string>('JWT_ISSUER') || 'classical-api';
    this.jwtAudience = configService.get<string>('JWT_AUDIENCE') || 'classical-service';
  }

  async createClient(
    merchantId: string,
    terminalName: string,
    scopes: string[],
  ): Promise<{ clientId: string; clientSecret: string }> {
    const clientId = randomUUID();
    const clientSecret = randomBytes(32).toString('hex');
    const clientSecretHash = await argon2.hash(clientSecret);

    await this.oauthClientRepository.create({
      clientId,
      clientSecretHash,
      merchantId,
      terminalName,
      scopes,
      isActive: true,
    });

    return { clientId, clientSecret };
  }

  async issueToken(
    clientId: string,
    clientSecret: string,
    requestedScopes?: string[],
  ): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  }> {
    const client = await this.oauthClientRepository.findByClientId(clientId);

    if (!client) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    if (!client.isActive) {
      throw new UnauthorizedException('Client has been revoked');
    }

    const secretValid = await argon2.verify(client.clientSecretHash, clientSecret);
    if (!secretValid) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    let scopes = client.scopes;
    if (requestedScopes && requestedScopes.length > 0) {
      const allValid = requestedScopes.every((s) => client.scopes.includes(s));
      if (!allValid) {
        throw new UnauthorizedException('Requested scopes exceed allowed scopes');
      }
      scopes = requestedScopes;
    }

    // Sign with RS256/JWKS via IJwtTokenPort (same as auth service)
    // sub must use "svc:" prefix for parseSubject() in JwtStrategy
    const tokenResult = await this.jwtTokenPort.sign({
      sub: `svc:${client.merchantId}`,
      iss: this.jwtIssuer,
      aud: this.jwtAudience,
      scope: scopes.join(' '),
      expiresIn: OAUTH_CONSTANTS.TOKEN_TTL_SECONDS,
      actorType: 'service',
      clientId: client.clientId,
      merchantId: client.merchantId,
      tenantId: client.merchantId,
    });

    if (!tokenResult.isSuccess) {
      this.logger.error('Failed to sign OAuth token');
      throw new UnauthorizedException('Failed to generate access token');
    }

    return {
      access_token: tokenResult.getValue(),
      token_type: OAUTH_CONSTANTS.TOKEN_TYPE,
      expires_in: OAUTH_CONSTANTS.TOKEN_TTL_SECONDS,
      scope: scopes.join(' '),
    };
  }

  async revokeClient(clientId: string, merchantId: string): Promise<void> {
    const client = await this.oauthClientRepository.findByClientId(clientId);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (client.merchantId !== merchantId) {
      throw new UnauthorizedException('Client does not belong to this merchant');
    }

    await this.oauthClientRepository.update(clientId, {
      isActive: false,
      revokedAt: new Date(),
    });
  }

  async deactivateClient(clientId: string): Promise<void> {
    const client = await this.oauthClientRepository.findByClientId(clientId);
    if (!client) throw new NotFoundException('OAuth client not found');

    await this.oauthClientRepository.update(clientId, {
      isActive: false,
    });
  }

  async reactivateClient(clientId: string): Promise<void> {
    const client = await this.oauthClientRepository.findByClientId(clientId);
    if (!client) throw new NotFoundException('OAuth client not found');
    if (client.revokedAt) throw new BadRequestException('Cannot reactivate a permanently revoked client');

    await this.oauthClientRepository.update(clientId, {
      isActive: true,
    });
  }

  async listClients(merchantId: string): Promise<Omit<import('../domain/ports/oauth-client-repository.port').OAuthClientEntity, 'clientSecretHash'>[]> {
    const clients = await this.oauthClientRepository.findByMerchantId(merchantId);

    return clients.map(({ clientSecretHash, ...rest }) => rest);
  }
}
