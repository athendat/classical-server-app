import { Injectable, Logger, Inject } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import {
  IJwtTokenPort,
  JwtPayload,
  DecodedJwt,
} from '../../domain/ports/jwt-token.port';
import type { IJwksPort } from '../../domain/ports/jwks.port';
import type { IReplayProtectionPort } from '../../domain/ports/replay-protection.port';
import {
  JwtGeneratedEvent,
  JwtValidatedEvent,
  JwtValidationFailedEvent,
  ReplayAttackDetectedEvent,
} from '../../events/auth.events';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { Result } from 'src/common/types/result.type';

interface JwtHeader {
  alg: string;
  typ: string;
  kid: string;
}

interface PrivateKeyProvider {
  getActivePrivateKey(): Promise<string | undefined>;
}

function isPrivateKeyProvider(obj: unknown): obj is PrivateKeyProvider {
  return (
    !!obj &&
    typeof obj === 'object' &&
    typeof (obj as Record<string, unknown>)['getActivePrivateKey'] ===
      'function'
  );
}

/**
 * Adaptador JWT con RS256 (asimétrico).
 * - Genera tokens con kid, exp, iat, jti, scope.
 * - Valida firma, claims, anti-replay, kid.
 * - Integra con AsyncContext para auditoría.
 * - Fail-closed: rechaza tokens inválidos.
 */
@Injectable()
export class JwtTokenAdapter implements IJwtTokenPort {
  private readonly logger = new Logger(JwtTokenAdapter.name);
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;
  private readonly clockSkewSec: number;

  constructor(
    @Inject('IJwksPort') private jwksPort: IJwksPort,
    @Inject('IReplayProtectionPort')
    private replayProtectionPort: IReplayProtectionPort,
    private asyncContext: AsyncContextService,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {
    this.jwtIssuer = configService.get<string>('JWT_ISSUER') || 'classical-api';
    this.jwtAudience =
      configService.get<string>('JWT_AUDIENCE') || 'classical-service';
    this.clockSkewSec = configService.get<number>('JWT_CLOCK_SKEW_SEC') || 10;
  }

  async sign(payload: JwtPayload): Promise<Result<string>> {
    const startTime = Date.now();
    const requestId = this.asyncContext.getRequestId() || 'unknown';

    try {
      // Obtener clave privada activa (fail-closed)
      const activeKey = await this.jwksPort.getActiveKey();
      if (!activeKey) {
        this.logger.error('No active JWKS key available for signing');

        const event: JwtGeneratedEvent = {
          type: 'jwt.generated',
          requestId,
          kid: 'unknown',
          sub: payload.sub,
          aud: payload.aud,
          scope: payload.scope,
          expiresAt: 0,
          timestamp: Date.now(),
        };
        // Nota: Vault redacta tokens en logs; se registra solo metadata
        this.eventEmitter.emit('auth.jwt-generated', event);

        return Result.fail({
          name: 'AuthError',
          message: 'No active signing key available',
          code: 'NO_ACTIVE_KEY',
          statusCode: 500,
        });
      }

      let privateKey: string | undefined;
      if (isPrivateKeyProvider(this.jwksPort)) {
        privateKey = await this.jwksPort.getActivePrivateKey();
      } else {
        this.logger.error('JWKS port does not expose getActivePrivateKey');
        throw new Error('Failed to retrieve active private key');
      }

      if (!privateKey) {
        throw new Error('Failed to retrieve active private key');
      }

      // Generar JTI único para anti-replay
      const jti = uuidv4();

      // Calcular timestamps
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.expiresIn || 900; // 15m default
      const expiresAt = (now + expiresIn) * 1000; // ms para asyncContext

      // Construir payload JWT
      const jwtPayload = {
        sub: payload.sub,
        iss: this.jwtIssuer,
        aud: payload.aud,
        scope: payload.scope,
        jti,
        iat: now,
        exp: now + expiresIn,
      };

      // Firmar token con kid en header
      const token = jwt.sign(jwtPayload, privateKey, {
        algorithm: 'RS256',
        header: {
          alg: 'RS256',
          typ: 'JWT',
          kid: activeKey.kid,
        },
      });

      // Registrar JTI para anti-replay
      const jtiRegistered = await this.replayProtectionPort.registerJti(
        jti,
        expiresAt,
      );
      if (!jtiRegistered) {
        this.logger.error(`Failed to register JTI for anti-replay: ${jti}`);
        return Result.fail({
          name: 'AuthError',
          message: 'Failed to register token ID',
          code: 'JTI_REGISTRATION_FAILED',
          statusCode: 500,
        });
      }

      // Emitir evento (sin exponer token)
      const event: JwtGeneratedEvent = {
        type: 'jwt.generated',
        requestId,
        kid: activeKey.kid,
        sub: payload.sub,
        aud: payload.aud,
        scope: payload.scope,
        expiresAt,
        timestamp: Date.now(),
      };
      this.eventEmitter.emit('auth.jwt-generated', event);

      this.logger.log(
        `JWT signed successfully. kid=${activeKey.kid}, sub=${payload.sub}, duration=${Date.now() - startTime}ms`,
      );

      return Result.ok(token);
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Failed to sign JWT: ${err.message}`, err.stack);

      return Result.fail({
        name: 'AuthError',
        message: err.message,
        code: 'JWT_SIGN_FAILED',
        statusCode: 500,
      });
    }
  }

  async verify(token: string): Promise<Result<any>> {
    const startTime = Date.now();
    const requestId = this.asyncContext.getRequestId() || 'unknown';

    try {
      // Decodificar sin validación primero para obtener kid
      const decodedRaw = jwt.decode(token, { complete: true });
      if (!decodedRaw || typeof decodedRaw !== 'object') {
        throw new Error('Token could not be decoded');
      }

      const decoded = decodedRaw as {
        header?: JwtHeader;
        payload?: Record<string, unknown>;
      };

      const kid = decoded.header?.kid;
      if (!kid || typeof kid !== 'string') {
        throw new Error('Missing kid in token header');
      }

      // Obtener clave pública para validación
      const jwksKey = await this.jwksPort.getKey(kid);
      if (!jwksKey) {
        throw new Error(`JWKS key not found or expired: ${kid}`);
      }

      // Validar firma y claims
      const verified = jwt.verify(token, jwksKey.publicKey, {
        algorithms: ['RS256'],
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        clockTimestamp: Math.floor(Date.now() / 1000),
        clockTolerance: this.clockSkewSec,
      }) as unknown;

      if (!verified || typeof verified !== 'object') {
        throw new Error('Invalid token payload');
      }

      type VerifiedJwt = {
        sub?: string;
        aud?: string | string[];
        scope?: string;
        jti?: string;
        exp?: number;
        iat?: number;
        iss?: string;
        [key: string]: unknown;
      };

      const payload = verified as VerifiedJwt;

      // Asegurar que sub exista y sea string; normalizar aud y scope para los eventos
      if (typeof payload.sub !== 'string') {
        throw new Error('Missing sub claim');
      }

      const eventAud = Array.isArray(payload.aud)
        ? payload.aud.join(' ')
        : typeof payload.aud === 'string'
          ? payload.aud
          : '';
      const eventScope = typeof payload.scope === 'string' ? payload.scope : '';

      // Validar JTI anti-replay (fail-closed)
      // Nota: Los refresh tokens permiten reutilización, así que no los marcamos como consumidos
      const isRefreshToken = typeof payload.type === 'string' && payload.type === 'refresh';

      if (!payload.jti) {
        throw new Error('Missing jti claim');
      }

      // Solo validar anti-replay para access tokens (no refresh tokens)
      if (!isRefreshToken) {
        const isReplayed = await this.replayProtectionPort.isJtiConsumed(
          payload.jti,
        );
        if (isReplayed) {
          const event: ReplayAttackDetectedEvent = {
            type: 'auth.replay_detected',
            requestId,
            jti: payload.jti,
            previousTimestamp: Date.now(), // Aproximado; idealmente guardaríamos el timestamp original
            attemptTimestamp: Date.now(),
          };
          this.eventEmitter.emit('auth.replay-detected', event);

          throw new Error('Token JTI already consumed (replay attack)');
        }
      }

      // Verificar que exp esté presente y sea numérico
      if (typeof payload.exp !== 'number') {
        throw new Error('Missing exp claim');
      }

      // Registrar JTI solo para access tokens, no para refresh tokens
      if (!isRefreshToken) {
        const jtiRegistered = await this.replayProtectionPort.registerJti(
          payload.jti,
          payload.exp * 1000,
        );
        if (!jtiRegistered) {
          throw new Error('Failed to register JTI (possible replay)');
        }
      }

      // Emitir evento exitoso
      const event: JwtValidatedEvent = {
        type: 'jwt.validated',
        requestId,
        kid,
        sub: payload.sub,
        aud: eventAud,
        scope: eventScope,
        timestamp: Date.now(),
      };
      this.eventEmitter.emit('auth.jwt-validated', event);

      this.logger.log(
        `JWT verified successfully. kid=${kid}, sub=${payload.sub}, duration=${Date.now() - startTime}ms`,
      );

      return Result.ok(payload);
    } catch (error: any) {
      const err = error as Error;
      this.logger.warn(
        `JWT verification failed: ${err.message} (duration=${Date.now() - startTime}ms)`,
      );

      // Emitir evento de fallo
      const failEvent: JwtValidationFailedEvent = {
        type: 'jwt.validation_failed',
        requestId,
        reason: err.message,
        errorCode: 'JWT_INVALID',
        timestamp: Date.now(),
      };
      this.eventEmitter.emit('auth.jwt-validation-failed', failEvent);

      return Result.fail({
        name: 'AuthError',
        message: 'JWT validation failed',
        code: 'JWT_INVALID',
        statusCode: 401,
      });
    }
  }

  decode(token: string): Promise<Result<DecodedJwt>> {
    try {
      const decodedRaw = jwt.decode(token, { complete: true });
      if (!decodedRaw || typeof decodedRaw !== 'object') {
        throw new Error('Token could not be decoded');
      }

      const decoded = decodedRaw as {
        header?: JwtHeader;
        payload?: Record<string, unknown>;
      };

      return Promise.resolve(
        Result.ok({
          token,
          payload: decoded.payload as Record<string, unknown>,
          kid: decoded.header?.kid || 'unknown',
          header: decoded.header,
        }),
      );
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Failed to decode JWT: ${err.message}`);

      return Promise.resolve(
        Result.fail({
          name: 'AuthError',
          message: err.message,
          code: 'JWT_DECODE_FAILED',
          statusCode: 400,
        }),
      );
    }
  }

  async getActiveKid(): Promise<string | null> {
    const activeKey = await this.jwksPort.getActiveKey();
    return activeKey?.kid || null;
  }
}
