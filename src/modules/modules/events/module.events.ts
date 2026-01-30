import { BaseDomainEvent } from '../../../common/events/base-domain.event';
import { Module } from '../domain/module.entity';

/**
 * Evento de dominio: Módulo creado
 * Emitido cuando se crea un nuevo módulo
 */
export class ModuleCreatedEvent extends BaseDomainEvent {
  readonly eventType = 'modules.module_created';

  constructor(
    public readonly module: Module,
    public readonly correlationId?: string,
  ) {
    super();
  }
}

/**
 * Evento de dominio: Módulo actualizado
 * Emitido cuando se actualiza un módulo existente
 */
export class ModuleUpdatedEvent extends BaseDomainEvent {
  readonly eventType = 'modules.module_updated';

  constructor(
    public readonly module: Module,
    public readonly previousModule?: Module,
    public readonly correlationId?: string,
  ) {
    super();
  }
}

/**
 * Evento de dominio: Módulo deshabilitado
 * Emitido cuando se deshabilita un módulo (soft-delete)
 */
export class ModuleDisabledEvent extends BaseDomainEvent {
  readonly eventType = 'modules.module_disabled';

  constructor(
    public readonly moduleId: string,
    public readonly moduleName: string,
    public readonly correlationId?: string,
  ) {
    super();
  }
}

/**
 * Evento de dominio: Módulos reordenados
 * Emitido cuando se reordena un grupo de módulos (por parent o nivel superior)
 * Se utiliza para invalidar la caché de navegación
 */
export class ModulesReorderedEvent extends BaseDomainEvent {
  readonly eventType = 'modules.modules_reordered';

  constructor(
    public readonly modules: Module[],
    public readonly parent?: string,
    public readonly correlationId?: string,
  ) {
    super();
  }
}

/**
 * Evento de dominio: Caché de navegación invalidado
 * Emitido cuando cambia algún módulo o sus permisos, requiriendo regeneración de navegación
 * Se usa para invalidar caché en 5 minutos y forzar regeneración
 */
export class NavigationCacheInvalidatedEvent extends BaseDomainEvent {
  readonly eventType = 'modules.navigation_cache_invalidated';

  constructor(
    public readonly reason: string,
    public readonly correlationId?: string,
  ) {
    super();
  }
}

