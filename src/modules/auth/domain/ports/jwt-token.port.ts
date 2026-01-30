import { Result } from 'src/common/types/result.type';

/**
 * Payload para generar JWT RS256.
 */
export interface JwtPayload {
  /** Sujeto (identificador del actor) */
  sub: string;

  /** Emisor del token */
  iss: string;

  /** Audiencia */
  aud: string;

  /** Alcances de permisos (space-separated) */
  scope: string;

  /** Duración del token en segundos */
  expiresIn: number;

  /** Claims adicionales */
  [key: string]: any;
}

/**
 * Token JWT decodificado con metadata.
 */
export interface DecodedJwt {
  /** Token codificado (sin firma validada) */
  token: string;

  /** Payload decodificado */
  payload: any;

  /** Kid de la clave usada para firma */
  kid: string;

  /** Header del JWT */
  header: any;
}

/**
 * Puerto para generación y validación de JWT con RS256.
 * Usa JWKS para firma y validación.
 */
export interface IJwtTokenPort {
  /**
   * Generar JWT RS256 con kid e incluir jti para anti-replay.
   * @param payload Datos a firmar
   * @returns JWT token firmado o error
   */
  sign(payload: JwtPayload): Promise<Result<string>>;

  /**
   * Validar firma JWT RS256 usando clave pública del kid.
   * @param token JWT a validar
   * @returns Payload decodificado o error (incluyendo validación de exp, iat, kid, jti)
   */
  verify(token: string): Promise<Result<any>>;

  /**
   * Decodificar JWT sin validar firma (para inspección).
   * Usar solo para debugging; para requests validad siempre usar verify().
   * @param token JWT a decodificar
   * @returns Datos decodificados o error
   */
  decode(token: string): Promise<Result<DecodedJwt>>;

  /**
   * Obtener kid de la clave activa actual.
   * @returns Kid
   */
  getActiveKid(): Promise<string | null>;
}
