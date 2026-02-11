/**
 * Estados posibles de un Tenant (negocio)
 */
export enum TenantStatus {
  /**
   * Tenant recién creado, en espera de revisión por admin
   */
  PENDING_REVIEW = 'pending_review',

  /**
   * Se solicitan más datos al tenant
   */
  MORE_DATA_REQUESTED = 'more_data_requested',

  /**
   * Tenant aprobado pero no completamente activo
   */
  APPROVED = 'approved',

  /**
   * Tenant rechazado (estado terminal)
   */
  REJECTED = 'rejected',

  /**
   * Tenant completamente activo y operativo
   */
  ACTIVE = 'active',

  /**
   * Tenant suspendido por incumplimiento o problemas
   */
  SUSPENDED = 'suspended',
}
