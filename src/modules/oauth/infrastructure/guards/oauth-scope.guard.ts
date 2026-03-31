import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const OAUTH_SCOPES_KEY = 'oauth_scopes';

export const RequiredScopes = (...scopes: string[]) =>
  SetMetadata(OAUTH_SCOPES_KEY, scopes);

@Injectable()
export class OAuthScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.get<string[]>(
      OAUTH_SCOPES_KEY,
      context.getHandler(),
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userScopes: string[] = request.user?.scopes || [];

    return requiredScopes.every((scope) => userScopes.includes(scope));
  }
}
