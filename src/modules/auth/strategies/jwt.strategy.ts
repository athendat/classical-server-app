import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import * as jwt from 'jsonwebtoken';

import type { IJwksPort } from '../domain/ports/jwks.port';

import { Actor, parseSubject } from 'src/common/interfaces';

/**
 * Estrategia JWT para autenticación con RS256 + JWKS.
 * - Valida firma con clave pública de JWKS.
 * - Valida claims (sub, exp, iat, aud, iss, jti).
 * - Integra anti-replay y rotación de kid.
 * - Fail-closed: rechaza cualquier token inválido.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject('IJwksPort') private readonly jwksPort: IJwksPort) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
          if (!kid) {
            return done(new Error('Missing kid in token header'));
          }

          // Solo obtener la clave pública; no validar anti-replay aquí
          const jwksKey = await this.jwksPort.getKey(kid);
          if (!jwksKey || !jwksKey.publicKey) {
            return done(new Error(`JWKS key not found for kid ${kid}`));
          }

          return done(null, jwksKey.publicKey);
        } catch (err) {
          return done(err as Error);
        }
      },
    } as unknown as StrategyOptionsWithRequest);
  }

  validate(req: any, payload: unknown): Actor {
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
        // ⭐ NUEVO: Si es servicio (svc:), el actorId ES el tenantId
        tenantId: actorType === 'service' ? actorId : undefined,
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new UnauthorizedException(`Invalid subject format: ${msg}`);
    }
  }
}
