import { Role } from '../domain';

/**
 * RoleUpdatedEvent - Evento de dominio cuando se actualiza un rol
 * Se emite después de guardar en BD y se escucha en AuthzModule
 */
export class RoleUpdatedEvent {
  constructor(
    public readonly role: Role,
    public readonly previousRole: Role,
    public readonly correlationId?: string,
  ) {}
}
