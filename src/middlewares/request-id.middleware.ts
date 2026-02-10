import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as jwt_decode from 'jwt-decode';
import { ClsService } from 'nestjs-cls';

import { AppClsStore } from '../common/context/cls-store.interface';
import { Actor } from 'src/common/interfaces';

/**
 * RequestIdMiddleware: Middleware global para gestionar IDs únicos de request
 *
 * ⭐ Con nestjs-cls:
 * - ClsModule ya proporciona requestId automáticamente
 * - Este middleware ENRIQUECE el contexto con actor y metadata adicional
 *
 * Responsabilidades:
 * - Validar y establecer requestId (o usar el generado por ClsModule)
 * - Extraer información del actor del JWT (sub, kid, scopes)
 * - Establecer actor en ClsService para acceso global
 * - Incluir en response headers
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestIdMiddleware.name);

  constructor(private readonly cls: ClsService<AppClsStore>) {}

  /**
   * Valida si una cadena es un UUIDv4 válido
   */
  private isValidUuid(value: string): boolean {
    const uuidv4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidv4Regex.test(value);
  }

  /**
   * Extraer información del actor del JWT
   */
  private extractActorFromJwt(req: Request): Actor | undefined {
    try {
      const authHeader = req.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return undefined;
      }

      const token = authHeader.substring(7);
      const decoded = (jwt_decode as any)(token);

      return {
        actorId: decoded.actorId || 'unknown',
        sub: decoded.sub || 'unknown',
        kid: decoded.kid,
        scopes: decoded.scope ? decoded.scope.split(' ') : [],
        ipAddress: this.extractIpAddress(req),
        actorType: decoded.actorType || 'user',
      };
    } catch (error: any) {
      this.logger.log(`Failed to extract actor from JWT: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Extraer IP address de la request
   */
  private extractIpAddress(req: Request): string {
    const forwarded = req.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0]?.trim() || 'unknown';
    }

    const realIp = req.get('x-real-ip');
    if (realIp) {
      return realIp;
    }

    return req.ip || 'unknown';
  }

  use(req: Request, res: Response, next: NextFunction) {
    console.log(`[REQUEST-ID-MIDDLEWARE] ${req.method} ${req.path}`);
    // 1. Obtener el requestId del ClsService (ya fue establecido por ClsModule)
    // O generar/validar uno si viene en headers
    const existingRequestId = req.get('x-request-id');
    let requestId: string;

    if (existingRequestId && this.isValidUuid(existingRequestId)) {
      requestId = existingRequestId;
    } else {
      // ClsService.getId() devuelve el ID generado por ClsModule
      requestId = this.cls.getId() ?? uuidv4();
    }

    console.log(`[REQUEST-ID-MIDDLEWARE] requestId=${requestId}`);

    // 2. Establecer el requestId en ClsService si es necesario
    this.cls.set('requestId', requestId);

    // 3. Adjuntar a res.locals para que esté disponible en controladores
    res.locals.requestId = requestId;

    // 4. Extraer información del actor
    const actor = this.extractActorFromJwt(req);
    if (actor) {
      // Establecer actor en ClsService para acceso global
      this.cls.set('actor', actor);
      res.locals.actor = actor;
    }

    // 5. Establecer el header en la response para que el cliente lo reciba
    res.setHeader('x-request-id', requestId);

    // 6. LOG inicial
    const actorInfo = actor
      ? `(actor: kid=${actor.kid || 'unknown'}, sub=${actor.sub})`
      : '';
    this.logger.log(
      `[${requestId}] ${req.method} ${req.path} - Request initiated ${actorInfo}`,
    );
    console.log(`[REQUEST-ID-MIDDLEWARE] Calling next()`);

    // 7. Hook para loguear respuesta
    res.on('finish', () => {
      console.log(
        `[REQUEST-ID-MIDDLEWARE] Response finished: ${res.statusCode}`,
      );
      this.logger.log(
        `[${requestId}] ${req.method} ${req.path} - Response sent (${res.statusCode})`,
      );
    });

    // 8. Continuar con la siguiente etapa del middleware/controlador
    // ⭐ ClsModule ya envuelve todo esto en AsyncLocalStorage automáticamente
    next();
  }
}
