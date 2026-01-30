import { Module } from '../module.entity';

/**
 * Puerto IModulesRepository - Contrato para persistencia de módulos
 * Implementado por MongoDBModulesRepository
 */
export interface IModulesRepository {
  /**
   * Crear un nuevo módulo
   */
  create(module: Module): Promise<Module>;

  /**
   * Obtener todos los módulos activos
   */
  findAll(): Promise<Module[]>;

  /**
   * Obtener todos los módulos (incluyendo disabled)
   */
  findAllIncludingDisabled(): Promise<Module[]>;

  /**
   * Obtener módulo por ID
   */
  findById(id: string): Promise<Module | null>;

  /**
   * Obtener módulo por indicator
   */
  findByIndicator(indicator: string): Promise<Module | null>;

  /**
   * Actualizar un módulo
   */
  update(id: string, module: Partial<Module>): Promise<Module | null>;

  /**
   * Soft-delete: actualizar status a 'disabled'
   */
  disable(id: string): Promise<Module | null>;

  /**
   * Hard-delete: eliminar completamente el documento
   */
  delete(id: string): Promise<boolean>;

  /**
   * Obtener módulos del sistema
   */
  findSystemModules(): Promise<Module[]>;

  /**
   * Contar módulos activos
   */
  count(): Promise<number>;
}
