import { Role } from '../domain';

/**
 * RoleCreatedEvent - Evento de dominio cuando se crea un rol
 * Se emite después de guardar en BD y se escucha en AuthzModule
 */
export class RoleCreatedEvent {
  constructor(
    public readonly role: Role,
    public readonly correlationId?: string,
  ) {}
}
