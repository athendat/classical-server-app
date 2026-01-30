/**
 * RolePermissionsUpdatedEvent
 * Evento de dominio emitido cuando se actualizan los permisos de un rol
 * 
 * Información registrada:
 * - roleId: ID del rol actualizado
 * - previousPermissionKeys: Permisos anteriores
 * - newPermissionKeys: Nuevos permisos
 * - correlationId: ID de correlación para trazabilidad
 */
export class RolePermissionsUpdatedEvent {
  constructor(
    public readonly roleId: string,
    public readonly previousPermissionKeys: string[],
    public readonly newPermissionKeys: string[],
    public readonly correlationId?: string,
  ) {}
}
