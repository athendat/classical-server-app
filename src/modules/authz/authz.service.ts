import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Service, ServiceDocument } from './schemas/service.schema';
import { Role, RoleDocument } from './schemas/role.schema';
import {
  User,
  UserDocument,
} from '../users/infrastructure/schemas/user.schema';

import { normalizePermissionKey } from './authz.constants';

import { Actor } from 'src/common/interfaces';

/**
 * Cache entry para permisos de un actor.
 * Ahora almacena la estructura categorizada de permisos (wildcards + exactos).
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
 * Servicio de autorización que resuelve permisos desde DB.
 * Implementa caché in-memory con TTL (fail-closed en error).
 */
@Injectable()
export class AuthzService {
  private readonly logger = new Logger(AuthzService.name);
  private readonly cache = new Map<string, PermissionsCacheEntry>();
  private readonly cacheTTL: number;
  private readonly maxCacheSize: number;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Service.name) private serviceModel: Model<ServiceDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
  ) {
    // TTL: 60 segundos (configurable vía env)
    this.cacheTTL = parseInt(process.env.AUTHZ_CACHE_TTL_MS ?? '60000', 10);
    this.maxCacheSize = parseInt(
      process.env.AUTHZ_MAX_CACHE_SIZE ?? '1000',
      10,
    );
  }

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
    const cacheKey = `${actor.actorType}:${actor.actorId}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      return cached.permissions;
    }

    try {
      const permissions = await this.fetchPermissionsFromDB(actor);
      this.setCacheEntry(cacheKey, permissions);
      return permissions;
    } catch (error) {
      this.logger.error(
        `Failed to resolve permissions for ${cacheKey}: ${error.message}`,
        error.stack,
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
   * Invalida cache de un actor específico.
   */
  invalidateCache(actorType: 'user' | 'service', actorId: string): void {
    const cacheKey = `${actorType}:${actorId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Limpia toda la caché (útil para tests o cambios masivos).
   */
  clearCache(): void {
    this.cache.clear();
  }

  private async fetchPermissionsFromDB(actor: Actor): Promise<{
    hasGlobalWildcard: boolean;
    moduleWildcards: Set<string>;
    exactPermissions: Set<string>;
  }> {
    let roleKeys: string[] = [];

    if (actor.actorType === 'user') {
      const user = await this.userModel
        .findOne({ userId: actor.actorId, status: 'active' })
        .lean()
        .exec();
      if (!user) {
        this.logger.warn(`User not found or disabled: ${actor.actorId}`);
        return {
          hasGlobalWildcard: false,
          moduleWildcards: new Set<string>(),
          exactPermissions: new Set<string>(),
        };
      }
      roleKeys = user.roleKey ? [user.roleKey] : [];
    } else if (actor.actorType === 'service') {
      const service = await this.serviceModel
        .findOne({ serviceId: actor.actorId, status: 'active' })
        .lean()
        .exec();
      if (!service) {
        this.logger.warn(`Service not found or disabled: ${actor.actorId}`);
        return {
          hasGlobalWildcard: false,
          moduleWildcards: new Set<string>(),
          exactPermissions: new Set<string>(),
        };
      }
      roleKeys = service.roleKeys ?? [];
    }

    if (roleKeys.length === 0) {
      return {
        hasGlobalWildcard: false,
        moduleWildcards: new Set<string>(),
        exactPermissions: new Set<string>(),
      };
    }

    // Expandir roles → permisos
    const roles = await this.roleModel
      .find({ key: { $in: roleKeys }, status: 'active' })
      .lean()
      .exec();

    const result = {
      hasGlobalWildcard: false,
      moduleWildcards: new Set<string>(),
      exactPermissions: new Set<string>(),
    };

    for (const role of roles) {
      for (const permKey of role.permissionKeys ?? []) {
        const normalized = normalizePermissionKey(permKey);
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

    const normalized = normalizePermissionKey(requiredPermission);

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

  private setCacheEntry(
    key: string,
    permissions: {
      hasGlobalWildcard: boolean;
      moduleWildcards: Set<string>;
      exactPermissions: Set<string>;
    },
  ): void {
    // Evitar crecimiento ilimitado
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      permissions,
      cachedAt: Date.now(),
    });
  }
}
