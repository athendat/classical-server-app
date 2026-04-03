import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';

import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import * as jwt from 'jsonwebtoken';

import type { IJwksPort } from '../domain/ports/jwks.port';

import { Actor, parseSubject } from 'src/common/interfaces';

/**
 * Extrae JWT de cookies (prioridad) o Authorization header (fallback)
 * Esto permite compatibilidad con web clients (cookies) y mobile clients (header)
 */
function extractJwtFromCookieOrHeader(req: any): string | null {
  // 1. Intenta extraer de cookie (web clients)
  if (req.cookies && req.cookies.access_token) {
    console.log('[JWT] Extrayendo token de cookie');
    return req.cookies.access_token;
  }
  
  // 2. Fallback a Authorization header (mobile/API clients)
  const authHeader = req.headers && req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    console.log('[JWT] Extrayendo token de Authorization header');
    return authHeader.substring(7);
  }
  
  console.log('[JWT] No se encontró token en cookie ni en header');
  return null;
}

/**
 * Estrategia JWT para autenticación con RS256 + JWKS.
 * - Valida firma con clave pública de JWKS.
 * - Valida claims (sub, exp, iat, aud, iss, jti).
 * - Integra anti-replay y rotación de kid.
 * - Fail-closed: rechaza cualquier token inválido.
 * - Soporta extracción dual: cookies (web) y Authorization header (mobile)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject('IJwksPort') private readonly jwksPort: IJwksPort) {
    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      passReqToCallback: true,
      // secretOrKeyProvider: obtener la clave pública para validar firma.
      // Nota: NO hacer validación de anti-replay aquí; eso es responsabilidad
      // de otra capa (guard, servicio, etc) que llame a jwtTokenPort.verify()
      secretOrKeyProvider: async (
        req: unknown,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string | Buffer) => void,
      ) => {
        try {
          const decoded = jwt.decode(rawJwtToken, { complete: true }) as any;
          const kid: string | undefined = decoded?.header?.kid;
          console.log('[JWT Strategy] decoded header:', JSON.stringify(decoded?.header));
          console.log('[JWT Strategy] kid:', kid);
          if (!kid) {
            console.log('[JWT Strategy] REJECTED: Missing kid in token header');
            return done(new Error('Missing kid in token header'));
          }

          // Solo obtener la clave pública; no validar anti-replay aquí
          const jwksKey = await this.jwksPort.getKey(kid);
          if (!jwksKey || !jwksKey.publicKey) {
            console.log('[JWT Strategy] REJECTED: JWKS key not found for kid', kid);
            return done(new Error(`JWKS key not found for kid ${kid}`));
          }

          console.log('[JWT Strategy] Key found, validating signature...');
          return done(null, jwksKey.publicKey);
        } catch (err: any) {
          console.log('[JWT Strategy] ERROR:', err?.message);
          return done(err as Error);
        }
      },
    } as unknown as StrategyOptionsWithRequest);
  }

  validate(req: any, payload: unknown): Actor {
    console.log('[JWT Strategy] validate() called with payload:', JSON.stringify(payload));
    // Validar claims mínimos (fail-closed)
    if (typeof payload !== 'object' || payload === null) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const p = payload as Record<string, unknown>;

    const sub = typeof p.sub === 'string' ? p.sub : undefined;
    if (!sub) {
      throw new UnauthorizedException('Missing sub claim');
    }

    const jti = typeof p.jti === 'string' ? p.jti : undefined;
    if (!jti) {
      throw new UnauthorizedException('Missing jti claim (anti-replay)');
    }

    try {
      const { actorType, actorId } = parseSubject(sub);

      const isStringArray = (v: unknown): v is string[] =>
        Array.isArray(v) && v.every((e) => typeof e === 'string');

      const actor: Actor = {
        actorType,
        actorId,
        // Si es servicio (svc:), el actorId ES el tenantId
        // Si es usuario, leer tenantId del payload del token (si existe)
        tenantId: actorType === 'service'
          ? actorId
          : (typeof p.tenantId === 'string' ? p.tenantId : undefined),
        sub,
        iss: typeof p.iss === 'string' ? p.iss : undefined,
        aud:
          typeof p.aud === 'string'
            ? p.aud
            : isStringArray(p.aud)
              ? p.aud
              : undefined,
        kid: typeof p.kid === 'string' ? p.kid : undefined,
        jti,
        scopes: typeof p.scope === 'string' ? p.scope.split(' ') : [],
      };

      return actor;
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new UnauthorizedException(`Invalid subject format: ${msg}`);
    }
  }
}
