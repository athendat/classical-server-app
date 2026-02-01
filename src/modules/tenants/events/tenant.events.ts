/**
 * Evento emitido cuando se crea un nuevo tenant
 */
export class TenantCreatedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly businessName: string,
    public readonly email: string,
    public readonly createdBy: string,
    public readonly timestamp: Date,
  ) {}
}

/**
 * Evento emitido cuando un tenant cambia de estado
 */
export class TenantStateTransitionedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly fromState: string,
    public readonly toState: string,
    public readonly triggeredBy: string,
    public readonly comment?: string,
    public readonly timestamp?: Date,
  ) {}
}

/**
 * Evento emitido cuando se actualiza información de un tenant
 */
export class TenantUpdatedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly fieldsChanged: string[],
    public readonly updatedBy: string,
    public readonly timestamp: Date,
  ) {}
}
