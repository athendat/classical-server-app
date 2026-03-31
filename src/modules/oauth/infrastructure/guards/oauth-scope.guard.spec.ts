import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OAuthScopeGuard } from './oauth-scope.guard';

describe('OAuthScopeGuard', () => {
  let guard: OAuthScopeGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new OAuthScopeGuard(reflector);
  });

  function createMockContext(userScopes: string[]): ExecutionContext {
    const mockRequest = {
      user: { scopes: userScopes },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn() as any,
      getArgs: () => [],
      getArgByIndex: () => null,
      switchToRpc: () => ({} as any),
      switchToWs: () => ({} as any),
      getType: () => 'http' as any,
    } as ExecutionContext;
  }

  it('should allow request when user has required scopes', () => {
    const context = createMockContext(['payments:authorize', 'transactions:read']);

    jest.spyOn(reflector, 'get').mockReturnValue(['payments:authorize']);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject request when user is missing required scope', () => {
    const context = createMockContext(['transactions:read']);

    jest.spyOn(reflector, 'get').mockReturnValue(['payments:authorize']);

    expect(guard.canActivate(context)).toBe(false);
  });

  it('should allow request when no scopes are required', () => {
    const context = createMockContext([]);

    jest.spyOn(reflector, 'get').mockReturnValue(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });
});
