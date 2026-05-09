import { Actor } from 'src/common/interfaces';

/** Forma mínima del usuario que necesita el armado del actor de lifecycle. */
export interface LifecycleActorUser {
  id: string;
  fullname?: string;
  roleKey?: string;
}

export interface LifecycleActorRecord {
  userId: string;
  username: string;
  roleKey: string;
}

/**
 * Construye el `triggeredBy` de un evento de ciclo de vida con valores
 * legibles. Centraliza la lógica para evitar repetirla y para evitar el
 * bug previo: usar `actor.sub` como username (que ya viene como `user:UUID`)
 * y `actor.scopes[0]` como roleKey (que terminaba siendo "Read").
 *
 * Cubre issue #29.
 */
export function buildLifecycleActor(
  actor: Actor | undefined,
  user: LifecycleActorUser | undefined,
): LifecycleActorRecord {
  if (!actor && !user) {
    return { userId: 'system', username: 'system', roleKey: 'system' };
  }

  const userId = user?.id ?? actor?.actorId ?? 'system';
  const username = user?.fullname || actor?.actorId || 'system';
  const roleKey = user?.roleKey || 'system';

  return { userId, username, roleKey };
}
