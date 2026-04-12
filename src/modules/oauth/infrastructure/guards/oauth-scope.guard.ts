import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IJwtTokenPort } from 'src/modules/auth/domain/ports/jwt-token.port';

export const OAUTH_SCOPES_KEY = 'oauth_scopes';

export const RequiredScopes = (...scopes: string[]) =>
  SetMetadata(OAUTH_SCOPES_KEY, scopes);

@Injectable()
export class OAuthScopeGuard implements CanActivate {
  private readonly logger = new Logger(OAuthScopeGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject('IJwtTokenPort')
    private readonly jwtTokenPort: IJwtTokenPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScopes = this.reflector.get<string[]>(
      OAUTH_SCOPES_KEY,
      context.getHandler(),
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Extract Bearer token from Authorization header
    const authHeader = request.headers['authorization'] as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Missing or invalid Authorization header');
      return false;
    }

    const token = authHeader.slice(7);

    // Verify JWT using the same JWKS/RS256 as auth service
    const result = await this.jwtTokenPort.verify(token);
    if (!result.isSuccess) {
      this.logger.warn(`OAuth token verification failed: ${result.getError()}`);
      return false;
    }

    const payload = result.getValue();

    // Parse scope claim (space-separated string → array)
    const scopeStr: string = payload.scope || '';
    const tokenScopes = scopeStr.split(' ').filter(Boolean);

    // Populate request.user for downstream use
    request.user = {
      sub: payload.sub,
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
  }
}
