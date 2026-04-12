import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import type { IJwksPort } from 'src/modules/auth/domain/ports/jwks.port';

export const OAUTH_SCOPES_KEY = 'oauth_scopes';

export const RequiredScopes = (...scopes: string[]) =>
  SetMetadata(OAUTH_SCOPES_KEY, scopes);

/**
 * Guard that verifies OAuth Bearer tokens and checks required scopes.
 *
 * Unlike the standard auth flow, OAuth service tokens are reusable
 * (no anti-replay JTI check). The guard verifies the RS256 signature
 * directly using the JWKS public key.
 */
@Injectable()
export class OAuthScopeGuard implements CanActivate {
  private readonly logger = new Logger(OAuthScopeGuard.name);
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;

  constructor(
    private readonly reflector: Reflector,
    @Inject('IJwksPort')
    private readonly jwksPort: IJwksPort,
    private readonly configService: ConfigService,
  ) {
    this.jwtIssuer = configService.get<string>('JWT_ISSUER') || 'classical-api';
    this.jwtAudience = configService.get<string>('JWT_AUDIENCE') || 'classical-service';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScopes = this.reflector.get<string[]>(
      OAUTH_SCOPES_KEY,
      context.getHandler(),
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Extract Bearer token
    const authHeader = request.headers['authorization'] as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Missing or invalid Authorization header');
      return false;
    }

    const token = authHeader.slice(7);

    try {
      // Decode header to get kid
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        this.logger.warn('Failed to decode JWT header');
        return false;
      }

      const kid = decoded.header.kid;
      if (!kid) {
        this.logger.warn('JWT missing kid in header');
        return false;
      }

      // Get public key from JWKS
      const jwksKey = await this.jwksPort.getKey(kid);
      if (!jwksKey) {
        this.logger.warn(`JWKS key not found for kid=${kid}`);
        return false;
      }

      // Verify signature and claims (NO anti-replay — OAuth tokens are reusable)
      const payload = jwt.verify(token, jwksKey.publicKey, {
        algorithms: ['RS256'],
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
      }) as Record<string, unknown>;

      // Parse scope claim (space-separated string → array)
      const scopeStr = (payload.scope as string) || '';
      const tokenScopes = scopeStr.split(' ').filter(Boolean);

      // Populate request.user for downstream use
      request.user = {
        sub: payload.sub,
        clientId: payload.clientId,
        scopes: tokenScopes,
        actorType: payload.actorType,
        merchantId: payload.merchantId,
        tenantId: payload.tenantId,
      };

      const hasScopes = requiredScopes.every((s) => tokenScopes.includes(s));
      if (!hasScopes) {
        this.logger.warn(
          `Insufficient scopes: required=${requiredScopes}, token=${tokenScopes}`,
        );
      }

      return hasScopes;
    } catch (err) {
      this.logger.warn(`OAuth token verification failed: ${(err as Error).message}`);
      return false;
    }
  }
}
