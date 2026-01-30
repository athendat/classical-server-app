/**
 * Enum para tipos de módulo
 * Define las categorías de módulos en el sistema
 */
export enum ModuleType {
  /**
   * Módulo básico: funcionalidad standalone
   * Ejemplos: Gateways, Terminals, Keys
   */
  basic = 'basic',

  /**
   * Módulo grupo: contiene submódulos o agrupa funcionalidades
   * Ejemplos: Admin, Configuration, Analytics
   */
  group = 'group',
}
