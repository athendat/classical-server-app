/**
 * RoleDisabledEvent - Evento de dominio cuando se deshabilita un rol
 * Se emite después de marcar el rol como disabled en BD
 */
export class RoleDisabledEvent {
  constructor(
    public readonly roleId: string,
    public readonly roleName: string,
    public readonly correlationId?: string,
  ) {}
}
