/**
 * Evento emitido cuando se genera un JWT.
 */
export interface JwtGeneratedEvent {
  type: 'jwt.generated';
  requestId: string;
  kid: string;
  sub: string;
  aud: string;
  scope: string;
  expiresAt: number;
  timestamp: number;
}

/**
 * Evento emitido cuando se valida un JWT exitosamente.
 */
export interface JwtValidatedEvent {
  type: 'jwt.validated';
  requestId: string;
  kid: string;
  sub: string;
  aud: string;
  scope: string;
  timestamp: number;
}

/**
 * Evento emitido cuando falla la validación de JWT.
 */
export interface JwtValidationFailedEvent {
  type: 'jwt.validation_failed';
  requestId: string;
  reason: string;
  errorCode: string;
  timestamp: number;
}

/**
 * Evento emitido cuando se detecta un ataque de replay (jti duplicado).
 */
export interface ReplayAttackDetectedEvent {
  type: 'auth.replay_detected';
  requestId: string;
  jti: string;
  previousTimestamp: number;
  attemptTimestamp: number;
}

/**
 * Evento emitido cuando se rota una clave JWKS.
 */
export interface JwksKeyRotatedEvent {
  type: 'jwks.key_rotated';
  oldKid: string;
  newKid: string;
  timestamp: number;
}

/**
 * Evento emitido cuando se invalida una clave JWKS.
 */
export interface JwksKeyInvalidatedEvent {
  type: 'jwks.key_invalidated';
  kid: string;
  reason: string;
  timestamp: number;
}

/**
 * Evento emitido cuando se registra un usuario.
 */
export class UserRegisteredEvent {
  constructor(
    public readonly username: string,
    public readonly phone: string,
    public readonly code: string,
  ) {}
}

export type AuthEvent =
  | JwtGeneratedEvent
  | JwtValidatedEvent
  | JwtValidationFailedEvent
  | ReplayAttackDetectedEvent
  | JwksKeyRotatedEvent
  | JwksKeyInvalidatedEvent
  | UserRegisteredEvent;
