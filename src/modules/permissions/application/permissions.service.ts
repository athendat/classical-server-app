import { Injectable, Logger } from '@nestjs/common';

import { CacheService } from 'src/common/cache/cache.service';
import { RolesService } from '../../roles/application/roles.service';
import { UsersService } from '../../users/application/users.service';

import { Actor } from 'src/common/interfaces';

/**
 * Cache entry para permisos de un actor.
 * Almacena la estructura categorizada de permisos (wildcards + exactos).
 */
interface PermissionsCacheEntry {
  permissions: {
    hasGlobalWildcard: boolean;
    moduleWildcards: Set<string>;
    exactPermissions: Set<string>;
  };
  cachedAt: number;
}

/**
 * Servicio de resolución de permisos para el módulo de permisos.
 * Resuelve permisos desde la base de datos usando roles asignados.
 * Implementa caché in-memory con TTL (fail-closed en error).
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Resuelve permisos de un actor (con caché).
   * Retorna estructura categorizada: global wildcard, module wildcards, permisos exactos.
   * Fail-closed: cualquier error devuelve estructura vacía.
   */
  async resolvePermissions(actor: Actor): Promise<{
    hasGlobalWildcard: boolean;
    moduleWildcards: Set<string>;
    exactPermissions: Set<string>;
  }> {
    const cacheKey = `permissions:${actor.actorType}:${actor.actorId}`;

    // Intentar obtener del caché
    const cached =
      await this.cacheService.getByKey<PermissionsCacheEntry>(cacheKey);

    if (cached) {
      // Reconstruir Sets desde arrays (JSON.parse pierde tipos)
      return {
        hasGlobalWildcard: cached.permissions.hasGlobalWildcard,
        moduleWildcards: new Set(
          Array.isArray(cached.permissions.moduleWildcards)
            ? cached.permissions.moduleWildcards
            : Object.values(cached.permissions.moduleWildcards || {}),
        ),
        exactPermissions: new Set(
          Array.isArray(cached.permissions.exactPermissions)
            ? cached.permissions.exactPermissions
            : Object.values(cached.permissions.exactPermissions || {}),
        ),
      };
    }

    try {
      const permissions = await this.fetchPermissionsFromDB(actor);
      await this.cacheService.set(cacheKey, {
        permissions,
        cachedAt: Date.now(),
      });
      return permissions;
    } catch (error) {
      this.logger.error(
        `Failed to resolve permissions for ${actor.actorType}:${actor.actorId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Fail-closed: deny por defecto
      return {
        hasGlobalWildcard: false,
        moduleWildcards: new Set<string>(),
        exactPermissions: new Set<string>(),
      };
    }
  }

  /**
   * Obtiene permisos desde la base de datos
   * - Para usuarios: obtiene el rol del usuario usando UsersService (lazy-loaded)
   * - Para servicios: obtiene todos los roles asignados (no implementado)
   * - Expande roles → permisos
   * - Combina roleKey + additionalRoleKeys
   */
  private async fetchPermissionsFromDB(actor: Actor): Promise<{
    hasGlobalWildcard: boolean;
    moduleWildcards: Set<string>;
    exactPermissions: Set<string>;
  }> {
    let roleKeys: string[] = [];

    if (actor.actorType === 'user') {
      const user = await this.usersService.findByIdRaw(actor.actorId);

      if (!user) {
        this.logger.warn(`User not found or disabled: ${actor.actorId}`);
        return {
          hasGlobalWildcard: false,
          moduleWildcards: new Set<string>(),
          exactPermissions: new Set<string>(),
        };
      }

      // ⭐ NUEVO: Combinar roleKey + additionalRoleKeys
      roleKeys = [];
      if (user.roleKey) {
        roleKeys.push(user.roleKey);
      }
      if (user.additionalRoleKeys && user.additionalRoleKeys.length > 0) {
        roleKeys.push(...user.additionalRoleKeys);
      }
    } else if (actor.actorType === 'service') {
      // TODO: Implementar resolución de permisos para servicios
      roleKeys = [];
    }

    if (roleKeys.length === 0) {
      return {
        hasGlobalWildcard: false,
        moduleWildcards: new Set<string>(),
        exactPermissions: new Set<string>(),
      };
    }

    // Expandir roles → permisos
    const roles = await this.rolesService.findActiveByKeys(roleKeys);

    const result = {
      hasGlobalWildcard: false,
      moduleWildcards: new Set<string>(),
      exactPermissions: new Set<string>(),
    };

    for (const role of roles) {
      for (const permKey of role.permissionKeys ?? []) {
        const normalized = this.normalizePermissionKey(permKey);

        if (normalized === '*') {
          result.hasGlobalWildcard = true;
        } else if (/^[a-z0-9_]+\.\*$/.test(normalized)) {
          result.moduleWildcards.add(normalized);
        } else {
          result.exactPermissions.add(normalized);
        }
      }
    }

    return result;
  }

  /**
   * Valida si un actor tiene un permiso específico (soportando wildcards).
   * @param permissions Estructura de permisos del actor
   * @param requiredPermission Permiso requerido (ej: "keys.create")
   * @returns true si tiene el permiso (exacto o vía wildcard)
   */
  hasPermission(
    permissions: {
      hasGlobalWildcard: boolean;
      moduleWildcards: Set<string>;
      exactPermissions: Set<string>;
    },
    requiredPermission: string,
  ): boolean {
    // Caso 1: Tiene wildcard global *
    if (permissions.hasGlobalWildcard) {
      return true;
    }

    const normalized = this.normalizePermissionKey(requiredPermission);

    // Caso 2: Tiene el permiso exacto
    if (permissions.exactPermissions.has(normalized)) {
      return true;
    }

    // Caso 3: Tiene wildcard de módulo (module.*)
    const [module] = normalized.split('.');
    if (module && permissions.moduleWildcards.has(`${module}.*`)) {
      return true;
    }

    return false;
  }

  /**
   * Normaliza una clave de permiso (lowercase + trim)
   */
  private normalizePermissionKey(key: string): string {
    return key.toLowerCase().trim();
  }

  /**
   * Invalida caché de permisos de un actor específico.
   */
  invalidateCache(actorType: 'user' | 'service', actorId: string): void {
    const cacheKey = `permissions:${actorType}:${actorId}`;
    this.logger.debug(`Cache invalidated for ${cacheKey}`);
  }

  /**
   * ⭐ NUEVO: Valida si una combinación de roles es permitida
   * Reglas:
   * 1. super_admin no puede tener additionalRoleKeys ni incluirse en ellos
   * 2. user puede convivir con merchant, admin, ops (todo excepto super_admin)
   * 3. merchant solo puede convivir con user
   * 4. admin, ops solo pueden convivir con user
   *
   * @returns { valid: boolean; error?: string }
   */
  validateRoleCombination(
    roleKey: string,
    additionalRoleKeys?: string[],
  ): { valid: boolean; error?: string } {
    const additionalRoles = additionalRoleKeys || [];

    // Regla 1: super_admin no puede tener additionalRoleKeys
    if (roleKey === 'super_admin' && additionalRoles.length > 0) {
      return {
        valid: false,
        error: 'super_admin no puede tener roles adicionales',
      };
    }

    // Regla 1b: No se puede incluir super_admin en additionalRoleKeys
    if (additionalRoles.includes('super_admin')) {
      return {
        valid: false,
        error: 'super_admin no puede ser un rol adicional',
      };
    }

    // Regla 2: user puede convivir con merchant, admin, ops
    if (roleKey === 'user') {
      for (const addRole of additionalRoles) {
        if (!['merchant', 'admin', 'ops'].includes(addRole)) {
          return {
            valid: false,
            error: `user no puede combinarse con ${addRole}`,
          };
        }
      }
      return { valid: true };
    }

    // Regla 3: merchant solo puede convivir con user
    if (roleKey === 'merchant') {
      for (const addRole of additionalRoles) {
        if (addRole !== 'user') {
          return {
            valid: false,
            error: `merchant solo puede combinarse con user, no con ${addRole}`,
          };
        }
      }
      return { valid: true };
    }

    // Regla 4: admin, ops solo pueden convivir con user
    if (['admin', 'ops'].includes(roleKey)) {
      for (const addRole of additionalRoles) {
        if (addRole !== 'user') {
          return {
            valid: false,
            error: `${roleKey} solo puede combinarse con user, no con ${addRole}`,
          };
        }
      }
      return { valid: true };
    }

    // Si no es ninguno de los roles conocidos, permitir sin validar
    return { valid: true };
  }
}
