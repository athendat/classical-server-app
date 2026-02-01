import type { UserDTO } from '../../../users/domain/ports/users.port';

/**
 * Interfaz para los datos de sesión almacenados en caché
 */
export interface SessionData {
  userId: string;
  user: UserDTO;
  loginTimestamp: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresIn: number;
}

/**
 * Puerto de persistencia de sesiones de usuario.
 *
 * Define las operaciones necesarias para guardar, recuperar, actualizar y eliminar
 * datos de sesión asociados a un identificador de usuario.
 *
 * @interface ISessionPort
 */
export interface ISessionPort {
  /**
   * Guarda una sesión para un usuario con un tiempo de vida (TTL).
   *
   * @param userId - Identificador único del usuario.
   * @param sessionData - Datos de la sesión a almacenar (tipo SessionData).
   * @param ttl - Tiempo de vida en segundos (Time-To-Live) tras el cual la sesión expira.
   * @returns Promise<void> - Resuelve cuando la sesión se ha persistido correctamente.
   * @throws Error - Si ocurre un fallo de persistencia.
   */
  saveSession(
    userId: string,
    sessionData: SessionData,
    ttl: number,
  ): Promise<void>;

  /**
   * Recupera la sesión almacenada para un usuario.
   *
   * @param userId - Identificador único del usuario.
   * @returns Promise<SessionData | null> - Resuelve con los datos de sesión si existe, o null si no hay sesión.
   * @throws Error - Si ocurre un fallo durante la lectura.
   */
  getSession(userId: string): Promise<SessionData | null>;

  /**
   * Actualiza parcialmente los datos de la sesión de un usuario y renueva su TTL.
   *
   * @param userId - Identificador único del usuario.
   * @param sessionData - Campos de la sesión a actualizar (Partial<SessionData>).
   * @param ttl - Nuevo tiempo de vida en segundos para la sesión.
   * @returns Promise<void> - Resuelve cuando la actualización se ha aplicado correctamente.
   * @throws Error - Si ocurre un fallo de persistencia o si la sesión no existe.
   */
  updateSession(
    userId: string,
    sessionData: Partial<SessionData>,
    ttl: number,
  ): Promise<void>;

  /**
   * Elimina la sesión asociada a un usuario.
   *
   * @param userId - Identificador único del usuario.
   * @returns Promise<void> - Resuelve cuando la sesión se ha eliminado o si no existía.
   * @throws Error - Si ocurre un fallo durante la eliminación.
   */
  clearSession(userId: string): Promise<void>;
}
