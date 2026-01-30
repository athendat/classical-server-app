/**
 * Puerto JWKS para gestión de claves de firma JWT.
 * Define contrato para obtener y rotar claves públicas.
 */
export interface JwksKey {
  /** Key ID para selección e identificación de claves */
  kid: string;

  /** Algoritmo de firma (p.ej. RS256) */
  alg: string;

  /** Clave pública en formato PEM */
  publicKey: string;

  /** Timestamp de creación (ms) */
  createdAt: number;

  /** Timestamp de expiración (ms) */
  expiresAt: number;

  /** Indica si la clave está activa para firma */
  isActive: boolean;
}

export interface IJwksPort {
  /**
   * Obtener clave pública por kid.
   * @param kid Key ID
   * @returns JWKS key o null si no existe/expiró
   */
  getKey(kid: string): Promise<JwksKey | null>;

  /**
   * Obtener clave pública activa (vigente) para firma.
   * @returns JWKS key activa o null
   */
  getActiveKey(): Promise<JwksKey | null>;

  /**
   * Listar todas las claves registradas.
   * @returns Array de JWKS keys
   */
  listKeys(): Promise<JwksKey[]>;

  /**
   * Rotar a nueva clave (generar nuevo kid y desactivar anterior).
   * @returns Nueva clave activa
   */
  rotateKey(): Promise<JwksKey>;

  /**
   * Invalidar clave por kid (p.ej. en caso de compromiso).
   * @param kid Key ID a invalidar
   */
  invalidateKey(kid: string): Promise<void>;
}
