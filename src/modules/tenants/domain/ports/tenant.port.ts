import { QueryFilter } from 'mongoose';
import { Tenant } from '../../infrastructure/schemas/tenant.schema';
import { TenantStatus } from '../enums';

/**
 * Puerto (interfaz de puerto) que define las operaciones disponibles para tenants
 * Implementado por TenantsRepository en la capa de infraestructura
 */
export interface ITenantPort {
  /**
   * Buscar un tenant por su ID
   */
  findById(tenantId: string): Promise<Tenant | null>;

  /**
   * Buscar un tenant por email
   */
  findByEmail(email: string): Promise<Tenant | null>;

  /**
   * Listar tenants con filtros y paginación
   */
  findAll(
    filter: QueryFilter<Tenant>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Tenant[]; total: number }>;

  /**
   * Crear un nuevo tenant
   */
  create(tenantData: any): Promise<Tenant>;

  /**
   * Actualizar un tenant existente
   */
  update(tenantId: string, updates: Partial<any>): Promise<Tenant>;

  /**
   * Cambiar el estado de un tenant
   */
  updateStatus(tenantId: string, status: TenantStatus): Promise<Tenant>;

  /**
   * Eliminar un tenant (soft delete si aplica)
   */
  delete(tenantId: string): Promise<void>;
}
