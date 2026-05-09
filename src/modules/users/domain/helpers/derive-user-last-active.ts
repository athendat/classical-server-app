/**
 * Forma mínima del usuario que necesita el cálculo de last_active.
 * Se acepta `unknown` en lugar de tipar contra el schema completo para
 * mantener el helper desacoplado de Mongoose.
 */
export interface UserLastActiveSource {
  lastActive?: Date | string | null;
  lastSession?: { loginTimestamp?: Date | string | null } | null;
}

/**
 * Devuelve la fecha más reciente entre `user.lastActive` (si se actualiza
 * desde el middleware de auth) y `user.lastSession.loginTimestamp`
 * (poblado desde el virtual del schema).
 *
 * Cubre issue #30 — el listado de usuarios mostraba siempre vacío en la
 * columna "Last Active".
 */
export function deriveUserLastActive(
  user: UserLastActiveSource,
): Date | null {
  const candidates: Date[] = [];

  if (user.lastActive) {
    const d = new Date(user.lastActive);
    if (!isNaN(d.getTime())) candidates.push(d);
  }

  const sessionTs = user.lastSession?.loginTimestamp;
  if (sessionTs) {
    const d = new Date(sessionTs);
    if (!isNaN(d.getTime())) candidates.push(d);
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((max, current) =>
    current.getTime() > max.getTime() ? current : max,
  );
}
