/**
 * Actor derivado del JWT tras autenticación.
 * NO incluir token completo ni secretos.
 */
export interface Actor {
  actorId: string; // subject (usuario/service)
  actorType?: 'user' | 'service'; // tipo de actor
  aud?: string | string[];
  ipAddress?: string; // IP del cliente
  iss?: string;
  jti?: string;
  kid?: string; // key ID usado para firma
  scopes?: string[]; // permisos
  sub: string; // subject (usuario/service)
}

/**
 * Parsea `sub` del JWT para derivar actorType y actorId.
 * Formato esperado: `user:{id}` o `svc:{id}`
 * Fail-closed: si no cumple formato, rechaza.
 */
export function parseSubject(
  sub: string,
): Pick<Actor, 'actorType' | 'actorId'> {
  const userMatch = sub.match(/^user:(.+)$/);
  if (userMatch) {
    return { actorType: 'user', actorId: userMatch[1] };
  }

  const svcMatch = sub.match(/^svc:(.+)$/);
  if (svcMatch) {
    return { actorType: 'service', actorId: svcMatch[1] };
  }

  throw new Error('Invalid sub format. Expected user:{id} or svc:{id}');
}
