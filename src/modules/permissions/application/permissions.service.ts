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

    // 1) Lectura de caché RESILIENTE: un fallo de Redis (lectura) NO debe
    // denegar permisos — se trata como cache-miss y se recomputa desde la DB.
    // (Antes esta llamada estaba fuera del try/catch, así que un error de Redis
    // hacía 403 en TODAS las peticiones.)
    try {
      const cached =
        await this.cacheService.getByKey<PermissionsCacheEntry>(cacheKey);
      if (cached) {
        // Reconstruir Sets desde arrays (JSON.parse pierde tipos)
        const reconstructed = {
          hasGlobalWildcard: cached.permissions.hasGlobalWildcard,
          moduleWildcards: new Set<string>(
            Array.isArray(cached.permissions.moduleWildcards)
              ? cached.permissions.moduleWildcards
              : Object.values(cached.permissions.moduleWildcards || {}),
          ),
          exactPermissions: new Set<string>(
            Array.isArray(cached.permissions.exactPermissions)
              ? cached.permissions.exactPermissions
              : Object.values(cached.permissions.exactPermissions || {}),
          ),
        };
        // Defensivo: una entrada legacy escrita por el bug del Set (serializado
        // como {}) reconstruye VACÍA. No la servimos (sería un 403 espurio hasta
        // que expire el TTL): la tratamos como miss y recomputamos desde la DB.
        if (!this.isEmptyPermissions(reconstructed)) {
          return reconstructed;
        }
      }
    } catch (error: any) {
      this.logger.warn(
        `Permission cache read failed (degrading to DB) for ${actor.actorType}:${actor.actorId}: ${(error as Error).message}`,
      );
    }

    // 2) Resolver desde la DB. Sólo un fallo de la DB (no del caché) puede
    // fallar-cerrado (deny).
    let permissions: {
      hasGlobalWildcard: boolean;
      moduleWildcards: Set<string>;
      exactPermissions: Set<string>;
    };
    try {
      permissions = await this.fetchPermissionsFromDB(actor);
    } catch (error: any) {
      this.logger.error(
        `Failed to resolve permissions for ${actor.actorType}:${actor.actorId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Fail-closed: deny por defecto SÓLO ante fallo de resolución (DB).
      return {
        hasGlobalWildcard: false,
        moduleWildcards: new Set<string>(),
        exactPermissions: new Set<string>(),
      };
    }

    // 3) Escritura de caché RESILIENTE: un fallo al cachear NO debe afectar el
    // resultado (la caché es una optimización, no una fuente de verdad).
    // Issue #42: además, NO cacheamos resoluciones vacías (evita envenenar la
    // sesión si un vacío fue transitorio).
    if (!this.isEmptyPermissions(permissions)) {
      try {
        // IMPORTANTE: serializar los Set como ARRAYS. CacheService.set hace
        // JSON.stringify, y `JSON.stringify(new Set([...]))` === '{}' — es decir,
        // un Set se persiste VACÍO y al releerlo los permisos quedaban en cero,
        // produciendo 403 intermitentes (200 en el cache-miss que computa fresco,
        // 403 durante el TTL leyendo el Set vacío). Guardamos arrays; la lectura
        // ya los reconstruye con `new Set(array)`.
        await this.cacheService.set(cacheKey, {
          permissions: {
            hasGlobalWildcard: permissions.hasGlobalWildcard,
            moduleWildcards: Array.from(permissions.moduleWildcards),
            exactPermissions: Array.from(permissions.exactPermissions),
          },
        });
      } catch (error: any) {
        this.logger.warn(
          `Permission cache write failed (ignored) for ${actor.actorType}:${actor.actorId}: ${(error as Error).message}`,
        );
      }
    }

    return permissions;
  }

  /**
   * Indica si una estructura de permisos no concede ningún acceso.
   * Issue #42: se usa para evitar cachear resoluciones vacías.
   */
  private isEmptyPermissions(permissions: {
    hasGlobalWildcard: boolean;
    moduleWildcards: Set<string>;
    exactPermissions: Set<string>;
  }): boolean {
    return (
      !permissions.hasGlobalWildcard &&
      permissions.moduleWildcards.size === 0 &&
      permissions.exactPermissions.size === 0
    );
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
    this.logger.log(`Cache invalidated for ${cacheKey}`);
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
