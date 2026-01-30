import { Result } from 'src/common/types/result.type';

/**
 * JWKS (JSON Web Key Set) entry with key material and metadata.
 */
export interface JWKSEntry {
  kid: string;
  alg: 'RS256';
  use: 'sig';
  kty: 'RSA';
  n: string; // modulus (base64url)
  e: string; // exponent (base64url)
  createdAt: number;
  expiresAt?: number;
}

/**
 * JWKS with versioning and rotation metadata.
 */
export interface JWKSData {
  keys: JWKSEntry[];
  issuedAt: number;
  version: string;
}

/**
 * JWT payload structure.
 */
export interface JWTPayload {
  sub: string; // subject (e.g., service ID)
  aud: string; // audience
  scope?: string[]; // permissions
  iss?: string; // issuer
  iat: number; // issued at
  exp: number; // expiration
  jti?: string; // JWT ID (for anti-replay)
}

/**
 * Signed JWT token.
 */
export interface SignedToken {
  token: string;
  kid: string;
  expiresAt: number;
}

/**
 * Auth error.
 */
export interface AuthError extends Error {
  code: string;
  statusCode: number;
}

/**
 * Domain port for authentication service.
 * Handles JWT signing, verification, and JWKS management.
 */
export interface IAuthService {
  /**
   * Sign JWT with active key.
   * Fail-closed: any error returns error result.
   *
   * @param payload Payload to sign
   * @returns Result with signed token or error
   */
  signJWT(payload: JWTPayload): Promise<Result<SignedToken>>;

  /**
   * Verify JWT token.
   * Fail-closed: any error (including expired, invalid sig) returns false.
   *
   * @param token JWT token to verify
   * @returns Result with payload or error
   */
  verifyJWT(token: string): Promise<Result<JWTPayload>>;

  /**
   * Get current JWKS.
   * Returns public keys only (no private material).
   *
   * @returns Result with JWKS data or error
   */
  getJWKS(): Promise<Result<JWKSData>>;

  /**
   * Rotate JWKS (generate new key, mark old as expiring).
   * Typically called by scheduled task or on compromiso event.
   *
   * @returns Result indicating success or error
   */
  rotateJWKS(): Promise<Result<JWKSData>>;

  /**
   * Check if JWT has been replayed (jti in cache).
   *
   * @param jti JWT ID (unique identifier)
   * @param expiresAt Token expiration time
   * @returns Result with boolean or error
   */
  checkAntiReplay(jti: string, expiresAt: number): Promise<Result<boolean>>;
}
