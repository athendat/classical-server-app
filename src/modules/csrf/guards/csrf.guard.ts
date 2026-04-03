import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CsrfService } from '../csrf.service';
import { AsyncContextService } from 'src/common/context';

export const SKIP_CSRF = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

@Injectable()
export class CsrfGuard implements CanActivate {
  // Métodos que requieren protección CSRF
  private readonly protectedMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

  // Rutas públicas que no requieren CSRF
  private readonly publicRoutes = [
    '/auth/login',
    '/auth/register',
    '/auth/register-merchant',
    '/auth/refresh',
    '/auth/logout',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/service-login',
    '/csrf-token',
    '/oauth/token',
  ];

  constructor(
    private readonly asyncContextService: AsyncContextService,
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    // Permitir métodos seguros (GET, HEAD, OPTIONS)
    if (!this.protectedMethods.includes(method)) {
      return true;
    }

    // Verificar decorador @SkipCsrf()
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCsrf) {
      return true;
    }

    // Extraer el path sin el global prefix (/api_053)
    // request.path es: /api_053/auth/login
    // Necesitamos: /auth/login
    const fullPath = request.path;
    let path = fullPath;

    if (fullPath.startsWith('/api_053/')) {
      path = fullPath.substring(8); // '/api_053/' tiene 9 caracteres
    }

    // Verificar rutas públicas
    if (this.publicRoutes.some((route) => path.startsWith(route))) {
      return true;
    }

    // Skip CSRF for service/API clients that authenticate via Bearer token
    // without browser session cookies. CSRF only protects browser-based sessions.
    const authHeader = request.headers['authorization'] as string | undefined;
    const hasSessionCookie = !!request.cookies?.['access_token'];
    if (authHeader?.startsWith('Bearer ') && !hasSessionCookie) {
      return true;
    }

    // Extraer token CSRF del header
    const csrfTokenHeader =
      request.headers['x-csrf-token'] || request.headers['x-xsrf-token'];

    // Extraer token CSRF de la cookie
    const csrfTokenCookie = request.cookies?.['XSRF-TOKEN'];

    if (!csrfTokenHeader || !csrfTokenCookie) {
      throw new ForbiddenException('CSRF token is missing');
    }

    // Double submit cookie: validar que header y cookie coincidan
    if (csrfTokenHeader !== csrfTokenCookie) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    // Validar token en cache (Redis)
    const isValid = await this.csrfService.validateToken(
      csrfTokenHeader as string,
    );

    if (!isValid) {
      throw new ForbiddenException('Invalid or expired CSRF token');
    }

    return true;
  }
}
