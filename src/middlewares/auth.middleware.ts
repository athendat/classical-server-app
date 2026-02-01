// Nest Modules
import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware de autenticación que valida x-api-key en TODAS las rutas
 * Se ejecuta primero, antes que cualquier otro procesamiento
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    console.log(`[AUTH-MIDDLEWARE] ${req.method} ${req.path}`);
    console.log(
      `[AUTH-MIDDLEWARE] Headers: x-api-key=${req.headers['x-api-key']}, auth=${req.headers['authorization'] ? 'PRESENT' : 'MISSING'}`,
    );
    const apiKey = (req.headers['x-api-key'] ?? '') as string;
    const validApiKey = this.configService.get<string>('API_KEY_CLASSICAL');

    console.log(`[AUTH-MIDDLEWARE] apiKey=${apiKey ? 'PRESENT' : 'MISSING'}`);

    if (!apiKey) {
      console.log(`[AUTH-MIDDLEWARE] REJECTING - missing x-api-key`);
      return res.status(401).json({
        statusCode: 401,
        message: 'Missing x-api-key header',
        error: 'Unauthorized',
      });
    }

    if (apiKey !== validApiKey) {
      console.log(`[AUTH-MIDDLEWARE] REJECTING - invalid x-api-key`);
      return res.status(401).json({
        statusCode: 401,
        message: 'Invalid x-api-key',
        error: 'Unauthorized',
      });
    }

    console.log(`[AUTH-MIDDLEWARE] PASSED - continuing to next middleware`);
    // API Key válida, continuar
    next();
  }
}
