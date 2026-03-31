import { Injectable, Inject, UnauthorizedException, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, randomBytes } from 'crypto';
import * as argon2 from 'argon2';

import type { IOAuthClientRepository } from '../domain/ports/oauth-client-repository.port';
import { OAUTH_CONSTANTS, OAUTH_INJECTION_TOKENS } from '../domain/constants/oauth.constants';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    @Inject(OAUTH_INJECTION_TOKENS.OAUTH_CLIENT_REPOSITORY)
    private readonly oauthClientRepository: IOAuthClientRepository,
    private readonly jwtService: JwtService,
  ) {}

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

    const accessToken = this.jwtService.sign(
      {
        sub: clientId,
        merchantId: client.merchantId,
        scopes,
        type: 'oauth_client_credentials',
      },
      {
        expiresIn: OAUTH_CONSTANTS.TOKEN_TTL_SECONDS,
      },
    );

    return {
      access_token: accessToken,
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

  async listClients(merchantId: string): Promise<Omit<import('../domain/ports/oauth-client-repository.port').OAuthClientEntity, 'clientSecretHash'>[]> {
    const clients = await this.oauthClientRepository.findByMerchantId(merchantId);

    return clients.map(({ clientSecretHash, ...rest }) => rest);
  }
}
