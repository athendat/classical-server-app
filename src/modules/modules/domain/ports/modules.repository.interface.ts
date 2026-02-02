import { ModuleEntity } from '../module.entity';

/**
 * Puerto IModulesRepository - Contrato para persistencia de módulos
 * Implementado por MongoDBModulesRepository
 */
export interface IModulesRepository {
  /**
   * Crear un nuevo módulo
   */
  create(module: ModuleEntity): Promise<ModuleEntity>;

  /**
   * Obtener todos los módulos activos
   */
  findAll(): Promise<ModuleEntity[]>;

  /**
   * Obtener todos los módulos (incluyendo disabled)
   */
  findAllIncludingDisabled(): Promise<ModuleEntity[]>;

  /**
   * Obtener módulo por ID
   */
  findById(id: string): Promise<ModuleEntity | null>;

  /**
   * Obtener módulo por indicator
   */
  findByIndicator(indicator: string): Promise<ModuleEntity | null>;

  /**
   * Actualizar un módulo
   */
  update(id: string, module: Partial<ModuleEntity>): Promise<ModuleEntity | null>;

  /**
   * Soft-delete: actualizar status a 'disabled'
   */
  disable(id: string): Promise<ModuleEntity | null>;

  /**
   * Hard-delete: eliminar completamente el documento
   */
  delete(id: string): Promise<boolean>;

  /**
   * Obtener módulos del sistema
   */
  findSystemModules(): Promise<ModuleEntity[]>;

  /**
   * Contar módulos activos
   */
  count(): Promise<number>;
}
