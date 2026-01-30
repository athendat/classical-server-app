import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Guard que valida la presencia y validez de la cabecera x-api-key
 * Excluye automáticamente rutas públicas
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly publicRoutes = [
    '/',
    '/health',
    '/metrics',
    '/auth/login',
    '/auth/refresh',
  ];

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const url = request.url ?? '';
    const path = url.split('?')[0]; // Remover query params

    // Verificar si es una ruta pública
    if (this.isPublicRoute(path)) {
      return true;
    }

    const apiKey = (request.headers['x-api-key'] ?? '') as string;
    const validApiKey = this.configService.get<string>('API_KEY');

    if (!apiKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    if (apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid x-api-key');
    }

    return true;
  }

  private isPublicRoute(path: string): boolean {
    return this.publicRoutes.some(
      (route) =>
        path.startsWith(route === '/' ? route : route + '/') || path === route,
    );
  }
}
