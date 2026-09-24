import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * LoggingMiddleware: Middleware global que logea TODAS las requests
 * Se ejecuta PRIMERO, antes que cualquier otro middleware
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`\n[LOGGING-MIDDLEWARE] INCOMING REQUEST: ${req.method} ${req.path}`);
    // Sin query string: puede llevar datos del Customer (p. ej. ?search=<idNumber>)
    console.log(`[LOGGING-MIDDLEWARE] Full URL: ${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`);
    console.log(`[LOGGING-MIDDLEWARE] Headers: Content-Type=${req.get('content-type')}, x-api-key=${req.get('x-api-key') ? 'YES' : 'NO'}`);
    
    if (req.method === 'OPTIONS') {
      console.log(`[LOGGING-MIDDLEWARE] CORS PREFLIGHT detected`);
      console.log(`[LOGGING-MIDDLEWARE] Origin: ${req.get('origin')}`);
      console.log(`[LOGGING-MIDDLEWARE] Access-Control-Request-Method: ${req.get('access-control-request-method')}`);
    }

    // Continuar al siguiente middleware
    next();
  }
}
