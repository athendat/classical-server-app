import { Injectable, Logger, HttpStatus } from '@nestjs/common';

import { AsyncContextService } from 'src/common/context/async-context.service';
import { ModulesService } from './modules.service';

import { ApiResponse } from 'src/common/types/api-response.type';
import { ModuleEntity } from '../domain/module.entity';
import { NavigationItem, NavigationResponse } from 'src/common/types';
import { PermissionsService } from 'src/modules/permissions/application/permissions.service';

/**
 * NavigationService
 * Servicio unificado para construcción de navegación dinámica
 * Orquesta obtención de permisos, módulos y construcción de estructura de navegación
 * Incluye lógica de filtrado, agrupación y validación de permisos
 *
 * El actor se obtiene del AsyncContextService en lugar de recibirlo como parámetro
 */
@Injectable()
export class NavigationService {
  private readonly logger = new Logger(NavigationService.name);

  constructor(
    private readonly asyncContextService: AsyncContextService,
    private readonly modulesService: ModulesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Construir navegación dinámica para un usuario autenticado
   *
   * Pasos:
   * 1. Obtener actor del contexto async
   * 2. Obtener permisos del usuario autenticado
   * 3. Obtener módulos del sistema
   * 4. Construir estructura de navegación (filtrar, agrupar, validar permisos)
   * 5. Retornar ApiResponse con navigationItems + metadatos
   *
   * @returns ApiResponse con navigationItems y metadatos
   */
  async buildNavigation(): Promise<ApiResponse<NavigationItem[]>> {
    // 1. Obtener actor del contexto async (inyectado por authentication.interceptor)
    const actor = this.asyncContextService.getActor();
    const requestId = this.asyncContextService.getRequestId();

    if (!actor || !actor.actorId || !actor.actorType) {
      this.logger.warn(`[${requestId}] Invalid actor in context`);
      throw new Error('Invalid actor in context');
    }

    this.logger.debug(
      `[${requestId}] Building navigation for actor: ${actor.actorType}:${actor.actorId}`,
    );

    try {
      // 2. Obtener permisos del usuario autenticado
      this.logger.debug(`[${requestId}] Step 1: Resolving user permissions...`);
      const permissionsResolved =
        await this.permissionsService.resolvePermissions(actor);

      // Convertir estructura categorizada de permisos a array simple
      const userPermissions: string[] = [];
      if (permissionsResolved.hasGlobalWildcard) {
        userPermissions.push('*');
      }
      userPermissions.push(...Array.from(permissionsResolved.moduleWildcards));
      userPermissions.push(...Array.from(permissionsResolved.exactPermissions));

      this.logger.debug(
        `[${requestId}] User has ${userPermissions.length} permissions`,
        {
          hasGlobal: permissionsResolved.hasGlobalWildcard,
          moduleWildcards: Array.from(permissionsResolved.moduleWildcards),
          exactPermissions: Array.from(permissionsResolved.exactPermissions),
        },
      );

      // 3. Obtener módulos del sistema
      this.logger.debug(
        `[${requestId}] Step 2: Fetching modules from database...`,
      );
      const modulesResult = await this.modulesService.findAll();
      const modules = modulesResult.data || [];

      this.logger.debug(`[${requestId}] Fetched ${modules.length} modules`);

      // 4. Construir estructura de navegación
      this.logger.debug(
        `[${requestId}] Step 3: Building navigation structure...`,
      );
      const navigationItems = this.buildNavigationItems(
        modules,
        userPermissions,
      );

      this.logger.debug(
        `[${requestId}] Built navigation with ${navigationItems.length} items`,
      );

      // 5. Construir respuesta con metadatos
      const response: NavigationResponse = {
        navigationItems,
      };

      this.logger.debug(`[${requestId}] Navigation built successfully`, {
        totalModules: modules.filter((m) => m.status === 'active').length,
        accessibleModules: navigationItems.length,
      });

      return ApiResponse.ok<NavigationItem[]>(
        HttpStatus.OK,
        navigationItems,
        'Navegación obtenida exitosamente',
        {
          totalModules: modules.filter((m) => m.status === 'active').length,
          accessibleModules: navigationItems.length,
          generatedAt: new Date().toISOString(),
          versionHash: '', // TODO: Agregar hash cuando se implemente caché
        },
      );
    } catch (error) {
      this.logger.error(
        `[${requestId}] Error building navigation: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Construye array de items de navegación basado en módulos y permisos del usuario
   *
   * Lógica:
   * 1. Filtra módulos con status: active
   * 2. Agrupa módulos por la propiedad 'parent' (indicator del módulo padre)
   * 3. Para cada parent, busca el módulo padre y crea un item tipo 'group' con children
   * 4. Módulos sin parent se agregan como items tipo 'basic' en top-level
   * 5. Filtra por permisos del usuario (OR lógica en grupos)
   * 6. Ordena items de nivel 0 (padres) y nivel 1 (hijos) por propiedad 'order'
   *
   * @param modules Array de módulos del sistema
   * @param userPermissions Array de permisos del usuario autenticado
   * @returns Array de NavigationItem ordenados
   */
  private buildNavigationItems(
    modules: ModuleEntity[],
    userPermissions: string[],
  ): NavigationItem[] {
    this.logger.debug(
      `Building navigation items for user with ${userPermissions.length} permissions`,
    );

    // 1. Filtrar: solo módulos activos
    const navigableModules = modules.filter((m) => m.status === 'active');

    // 2. Separar módulos: con parent vs sin parent
    const modulesWithParent = navigableModules.filter((m) => m.parent);
    const modulesWithoutParent = navigableModules.filter((m) => !m.parent);

    const navigationItems: NavigationItem[] = [];

    // 3. Procesar módulos con parent: crear grupos
    const parentsMap = new Map<string, ModuleEntity[]>();
    for (const module of modulesWithParent) {
      if (!parentsMap.has(module.parent!)) {
        parentsMap.set(module.parent!, []);
      }
      parentsMap.get(module.parent!)!.push(module);
    }

    // Crear items tipo 'group' para cada parent encontrado
    const processedParentIndicators = new Set<string>();
    for (const [parentIndicator, childModules] of parentsMap.entries()) {
      // Buscar el módulo padre para obtener sus propiedades
      const parentModule = navigableModules.find(
        (m) => m.indicator === parentIndicator,
      );

      const groupChildren = childModules
        .filter((m) => this.userHasModulePermission(userPermissions, m))
        .map((m) => this.mapModuleToNavigationItem(m))
        .sort((a, b) => a.order - b.order);

      // Solo incluir grupo si tiene al menos un hijo accesible
      if (groupChildren.length > 0) {
        const groupItem: NavigationItem = {
          id: parentModule!.id,
          title: parentModule?.name || this.capitalizeCategory(parentIndicator),
          subtitle: parentModule?.description,
          type: parentModule?.type || 'group',
          icon: parentModule?.icon,
          order: parentModule?.order ?? 0,
          children: groupChildren,
        };
        navigationItems.push(groupItem);
        // Marcar este módulo padre como ya procesado (no agregarlo como item básico)
        processedParentIndicators.add(parentIndicator);
      }
    }

    // 4. Procesar módulos sin parent: items básicos en top-level
    // Excluir módulos que ya fueron procesados como padres de grupo
    for (const module of modulesWithoutParent) {
      if (
        !processedParentIndicators.has(module.indicator) &&
        this.userHasModulePermission(userPermissions, module)
      ) {
        navigationItems.push(this.mapModuleToNavigationItem(module));
      }
    }

    // 5. Ordenar items de navegación por 'order' (nivel 0)
    navigationItems.sort((a, b) => a.order - b.order);

    this.logger.debug(
      `Navigation items built: ${navigationItems.length} items from ${navigableModules.length} modules`,
    );

    return navigationItems;
  }

  /**
   * Valida si el usuario tiene permiso para acceder a un módulo
   * Usa validación de wildcards: *, module.*, module.action
   *
   * @param userPermissions Array de permisos del usuario
   * @param module Módulo a validar
   * @returns true si usuario tiene al menos un permiso del módulo
   */
  private userHasModulePermission(
    userPermissions: string[],
    module: ModuleEntity,
  ): boolean {
    // Si no hay permisos en el módulo, denegar acceso
    if (!module.permissions || module.permissions.length === 0) {
      return false;
    }

    // Extraer indicators de permisos del módulo
    const modulePermissionIndicators = module.permissions
      .filter((p) => p.enabled)
      .map((p) => p.indicator);

    // Validar si usuario tiene algún permiso del módulo usando wildcards
    return modulePermissionIndicators.some((modulePermission) =>
      this.permissionMatches(userPermissions, modulePermission),
    );
  }

  /**
   * Valida si un permiso específico coincide con alguno de los permisos del usuario
   * Soporta wildcards: *, modules.*, modules.read
   *
   * @param userPermissions Array de permisos del usuario
   * @param requiredPermission Permiso requerido (ej: 'modules.read')
   * @returns true si hay coincidencia
   */
  private permissionMatches(
    userPermissions: string[],
    requiredPermission: string,
  ): boolean {
    return userPermissions.some((userPerm) => {
      // Permiso global wildcard
      if (userPerm === '*') {
        return true;
      }

      // Permiso exacto
      if (userPerm === requiredPermission) {
        return true;
      }

      // Wildcard pattern: userPerm='modules.*' debe coincidir con requiredPermission='modules.read'
      if (userPerm.endsWith(':*') || userPerm.endsWith('.*')) {
        const pattern = userPerm.slice(0, -2); // Remove .* or :*
        const delimiter = userPerm.endsWith(':*') ? ':' : '.';
        const requiredPrefix = requiredPermission.split(delimiter)[0];
        return requiredPrefix === pattern;
      }

      return false;
    });
  }

  /**
   * Mapea propiedades de Module a NavigationItem
   * Construye el link con:
   * - Si tiene padre: /{parentIndicator}/{moduleIndicator}
   * - Si no tiene padre: /{moduleIndicator}
   *
   * @param module Módulo a mapear
   * @returns NavigationItem tipo 'basic'
   */
  private mapModuleToNavigationItem(module: ModuleEntity): NavigationItem {
    const link = module.parent
      ? `/${module.parent}/${module.indicator}`
      : `/${module.indicator}`;

    return {
      id: module.id,
      title: module.name,
      subtitle: module.description,
      type: module.type,
      icon: module.icon,
      link,
      indicator: module.indicator,
      order: module.order ?? 0,
    };
  }

  /**
   * Normaliza nombre de categoría para usar como ID
   * Ej: 'Key Management' → 'key-management'
   *
   * @param category Nombre de categoría
   * @returns ID normalizado
   */
  private normalizeCategory(category: string): string {
    return category
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Capitaliza nombre de categoría para mostrar en UI
   * Ej: 'key-management' → 'Key Management'
   *
   * @param category Nombre de categoría
   * @returns Categoría capitalizada
   */
  private capitalizeCategory(category: string): string {
    return category
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
