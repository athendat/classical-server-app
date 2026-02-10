import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  SignJWT,
  jwtVerify,
  importSPKI,
  decodeProtectedHeader,
  importPKCS8,
} from 'jose';
import { generateKeyPairSync } from 'crypto';

import { AsyncContextService } from 'src/common/context/async-context.service';
import {
  IAuthService,
  JWTPayload,
  SignedToken,
  JWKSData,
  JWKSEntry,
  AuthError,
} from '../../domain/ports/auth.port';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import type { IAntiReplayCache } from 'src/common/interfaces/anti-replay-cache.interface';

import { AuthOperationEvent } from '../../events/auth-operation.event';
import { Result } from 'src/common/types/result.type';

/**
 * Cached key with rotation metadata.
 */
interface CachedKeyData {
  kid: string;
  publicKeyPEM: string;
  privateKeyPEM: string;
  jwksEntry: JWKSEntry;
  isActive: boolean;
}

/**
 * Hexagonal adapter for authentication service.
 * Implements JWT RS256 signing/verification with JWKS and anti-replay.
 */
@Injectable()
export class AuthAdapter implements IAuthService {
  private readonly logger = new Logger(AuthAdapter.name);
  private keys: Map<string, CachedKeyData> = new Map();
  private activeKeyId: string | null = null;
  private readonly jwtExpiration: number;
  private readonly keyRotationDays: number;
  private readonly clockSkewSecs: number;
  private readonly issuer: string;

  constructor(
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly asyncContext: AsyncContextService,
    @Inject(INJECTION_TOKENS.ANTI_REPLAY_CACHE)
    private readonly antiReplayCache: IAntiReplayCache,
  ) {
    this.jwtExpiration = config.get<number>('jwt.expirationSec') ?? 3600;
    this.keyRotationDays = config.get<number>('jwt.keyRotationDays') ?? 30;
    this.clockSkewSecs = config.get<number>('jwt.clockSkewSec') ?? 60;
    this.issuer = config.get<string>('jwt.issuer') ?? 'fx-kms-api';

    // Initialize with default key
    this.generateAndCacheKey();
  }

  /**
   * Sign JWT with active key.
   */
  async signJWT(payload: JWTPayload): Promise<Result<SignedToken>> {
    const startTime = Date.now();

    try {
      if (!this.activeKeyId) {
        throw new Error('No active key available');
      }

      const keyData = this.keys.get(this.activeKeyId);
      if (!keyData) {
        throw new Error('Active key not found');
      }

      // Import private key
      const privateKey = await importPKCS8(keyData.privateKeyPEM, 'RS256');

      // Build final payload
      const now = Math.floor(Date.now() / 1000);
      const jti = this.generateJTI();
      const finalPayload: any = {
        ...payload,
        iss: payload.iss || this.issuer,
        iat: now,
        exp: now + this.jwtExpiration,
        jti,
      };

      // Pre-compute expiration in ms to avoid unsafe member access on `any`
      const expiresAtMs = (now + this.jwtExpiration) * 1000;

      // Sign with kid in header
      const token = await new SignJWT(finalPayload)
        .setProtectedHeader({
          alg: 'RS256',
          kid: this.activeKeyId,
        })
        .sign(privateKey);

      const signedToken: SignedToken = {
        token,
        kid: this.activeKeyId,
        expiresAt: expiresAtMs,
      };

      this.emitEvent(
        'sign',
        'completed',
        Date.now() - startTime,
        payload.sub,
        this.activeKeyId,
      );
      return Result.ok(signedToken);
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Failed to sign JWT: ${err.message}`, err.stack);

      const authError: AuthError = {
        name: 'AuthError',
        message: err.message,
        code: 'AUTH_SIGN_FAILED',
        statusCode: 500,
      };

      this.emitEvent('sign', 'failed', Date.now() - startTime, payload.sub);
      return Result.fail(authError);
    }
  }

  /**
   * Verify JWT token.
   */
  async verifyJWT(token: string): Promise<Result<JWTPayload>> {
    const startTime = Date.now();

    try {
      // Decode header to get kid
      const header = decodeProtectedHeader(token);
      const kid = header.kid as string;

      if (!kid) {
        throw new Error('JWT missing kid in header');
      }

      const keyData = this.keys.get(kid);
      if (!keyData) {
        throw new Error(`Key not found: ${kid}`);
      }

      // Import public key for verification
      const publicKey = await importSPKI(keyData.publicKeyPEM, 'RS256');

      // Verify signature and claims
      const verified = await jwtVerify(token, publicKey, {
        algorithms: ['RS256'],
        clockTolerance: this.clockSkewSecs,
      });

      const payload = verified.payload as JWTPayload;

      // Check anti-replay if jti present
      if (payload.jti) {
        const isSeen = await this.antiReplayCache.has(payload.jti);
        if (isSeen) {
          const err: AuthError = {
            name: 'AuthError',
            message: 'JWT token replayed (jti already seen)',
            code: 'AUTH_REPLAY_DETECTED',
            statusCode: 401,
          };
          this.emitEvent(
            'verify',
            'failed',
            Date.now() - startTime,
            payload.sub,
            kid,
          );
          return Result.fail(err);
        }

        // Record this jti as seen (with expiration)
        const expiresAt = new Date((payload.exp || 0) * 1000);
        await this.antiReplayCache.add(payload.jti, expiresAt);
      }

      this.emitEvent(
        'verify',
        'completed',
        Date.now() - startTime,
        payload.sub,
        kid,
      );
      return Result.ok(payload);
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Failed to verify JWT: ${err.message}`);

      const authError: AuthError = {
        name: 'AuthError',
        message: err.message,
        code: 'AUTH_VERIFY_FAILED',
        statusCode: 401,
      };

      this.emitEvent('verify', 'failed', Date.now() - startTime);
      return Result.fail(authError);
    }
  }

  /**
   * Get current JWKS (public keys only).
   */
  getJWKS(): Promise<Result<JWKSData>> {
    try {
      const keys: JWKSEntry[] = Array.from(this.keys.values())
        .map((k) => k.jwksEntry)
        .filter((k) => !k.expiresAt || k.expiresAt > Date.now());

      const jwks: JWKSData = {
        keys,
        issuedAt: Date.now(),
        version: '1.0.0',
      };

      return Promise.resolve(Result.ok(jwks));
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Failed to get JWKS: ${err.message}`);

      const authError: AuthError = {
        name: 'AuthError',
        message: err.message,
        code: 'AUTH_JWKS_FAILED',
        statusCode: 500,
      };

      return Promise.resolve(Result.fail(authError));
    }
  }

  /**
   * Rotate JWKS (generate new key, mark old as expiring).
   */
  async rotateJWKS(): Promise<Result<JWKSData>> {
    const startTime = Date.now();

    try {
      // Mark old key as expiring
      if (this.activeKeyId) {
        const oldKey = this.keys.get(this.activeKeyId);
        if (oldKey) {
          oldKey.jwksEntry.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
          oldKey.isActive = false;
        }
      }

      // Generate new key
      this.generateAndCacheKey();

      this.logger.log(`JWKS rotated. New active key: ${this.activeKeyId}`);
      this.emitEvent(
        'rotate',
        'completed',
        Date.now() - startTime,
        undefined,
        this.activeKeyId || 'unknown',
      );

      return this.getJWKS();
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Failed to rotate JWKS: ${err.message}`, err.stack);

      const authError: AuthError = {
        name: 'AuthError',
        message: err.message,
        code: 'AUTH_ROTATE_FAILED',
        statusCode: 500,
      };

      this.emitEvent('rotate', 'failed', Date.now() - startTime);
      return Result.fail(authError);
    }
  }

  /**
   * Check if JWT has been replayed.
   */
  async checkAntiReplay(
    jti: string,
    // _expiresAt: number,
  ): Promise<Result<boolean>> {
    try {
      const isSeen = await this.antiReplayCache.has(jti);
      this.emitEvent('check-replay', 'completed', 0);
      return Result.ok(isSeen);
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Failed to check anti-replay: ${err.message}`);

      const authError: AuthError = {
        name: 'AuthError',
        message: err.message,
        code: 'AUTH_REPLAY_CHECK_FAILED',
        statusCode: 500,
      };

      this.emitEvent('check-replay', 'failed', 0);
      return Result.fail(authError);
    }
  }

  // ===== Private Methods =====

  private async generateAndCacheKey(): Promise<void> {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const kid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const publicKeyPEM = publicKey;
    const privateKeyPEM = privateKey;

    // Extract RSA components for JWKS
    const { n, e } = await this.extractRSAComponents(publicKeyPEM);

    const jwksEntry: JWKSEntry = {
      kid,
      alg: 'RS256',
      use: 'sig',
      kty: 'RSA',
      n,
      e,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.keyRotationDays * 24 * 60 * 60 * 1000,
    };

    const keyData: CachedKeyData = {
      kid,
      publicKeyPEM,
      privateKeyPEM,
      jwksEntry,
      isActive: true,
    };

    this.keys.set(kid, keyData);
    this.activeKeyId = kid;
    this.logger.log(`Generated new key with kid: ${kid}`);
  }

  private async extractRSAComponents(
    publicKeyPEM: string,
  ): Promise<{ n: string; e: string }> {
    // This would extract n and e from PEM
    // Try to extract RSA modulus (n) and exponent (e) as base64url strings.
    // Prefer using Node's crypto.createPublicKey().export({ format: 'jwk' }) when available,
    // fall back to jose.exportJWK(importSPKI(...)) if necessary.
    try {
      // Attempt Node.js builtin pathway
      try {
        const { createPublicKey } = await import('crypto');
        const pubKey = createPublicKey(publicKeyPEM);
        // export as JWK; Node returns base64url encoded n/e
        // treat result as unknown and narrow via runtime checks to avoid `any`
        const jwkUnknown = pubKey.export({ format: 'jwk' }) as unknown;

        const isRecord = (v: unknown): v is Record<string, unknown> =>
          typeof v === 'object' && v !== null;

        if (
          isRecord(jwkUnknown) &&
          jwkUnknown.kty === 'RSA' &&
          typeof jwkUnknown.n === 'string' &&
          typeof jwkUnknown.e === 'string'
        ) {
          // jwkUnknown is now narrowed to have string n/e
          return { n: jwkUnknown.n, e: jwkUnknown.e };
        }

        // else fall through to jose-based extraction
        this.logger.log(
          'createPublicKey.export(jwk) did not return RSA n/e, falling back to jose',
        );
      } catch (nodeErr) {
        this.logger.log(
          'Node crypto JWK export unavailable or failed, falling back to jose',
          nodeErr as Error,
        );
      }

      // Fallback: use jose to import SPKI and export JWK
      try {
        const keyLike = await importSPKI(publicKeyPEM, 'RS256');
        const { exportJWK } = await import('jose');
        const jwkUnknown: unknown = await exportJWK(keyLike);

        const isRSAJWK = (
          v: unknown,
        ): v is { kty: 'RSA'; n: string; e: string } => {
          if (typeof v !== 'object' || v === null) return false;
          const r = v as Record<string, unknown>;
          return (
            r.kty === 'RSA' &&
            typeof r.n === 'string' &&
            typeof r.e === 'string'
          );
        };

        if (isRSAJWK(jwkUnknown)) {
          return { n: jwkUnknown.n, e: jwkUnknown.e };
        }

        throw new Error(
          'Failed to extract RSA components via jose (missing n/e)',
        );
      } catch (joseErr) {
        this.logger.error(
          'Failed to extract RSA components from PEM',
          joseErr as Error,
        );
        throw joseErr;
      }
    } catch (error: any) {
      // Ensure the caller gets an explicit failure rather than the placeholder
      throw new Error(
        `extractRSAComponents failed: ${(error as Error).message}`,
      );
    }
  }

  private generateJTI(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 16)}`;
  }

  private emitEvent(
    operation: 'sign' | 'verify' | 'rotate' | 'check-replay',
    status: 'completed' | 'failed',
    duration: number,
    subject?: string,
    kid?: string,
    error?: Error,
  ): void {
    const event = new AuthOperationEvent(
      operation,
      status,
      duration,
      subject,
      kid,
      error,
      this.asyncContext.getRequestId(),
    );
    this.eventEmitter.emit('auth.operation', event);
  }
}
