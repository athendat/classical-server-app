import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

import { Model } from 'mongoose';

import { AsyncContextService } from 'src/common/context/async-context.service';

import { Service, ServiceDocument } from '../../schemas/service.schema';
import { Role, RoleDocument } from '../../schemas/role.schema';
import {
  User,
  UserDocument,
} from 'src/modules/users/infrastructure/schemas/user.schema';

import { AuthzOperationEvent } from '../../events/authz-operation.event';

import { IAuthzService, AuthzError } from '../../domain/ports/authz.port';
import type { ICacheService } from 'src/common/interfaces/cache.interface';
import { Result } from 'src/common/types/result.type';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { Actor } from 'src/common/interfaces';

/**
 * Hexagonal adapter for authorization service.
 * Implements domain port IAuthzService, uses Result pattern, emits events.
 */
@Injectable()
export class AuthzAdapter implements IAuthzService {
  private readonly logger = new Logger(AuthzAdapter.name);
  private readonly cacheTTL: number;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Service.name) private serviceModel: Model<ServiceDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly asyncContext: AsyncContextService,
    @Inject(INJECTION_TOKENS.CACHE_SERVICE)
    private readonly cacheService: ICacheService,
  ) {
    this.cacheTTL = config.get<number>('cache.ttlMs') ?? 60000;
  }

  /**
   * Resolve permissions for actor (with caching).
   * Fail-closed: any error returns empty permissions set with error result.
   */
  async resolvePermissions(actor: Actor): Promise<Result<Set<string>>> {
    const startTime = Date.now();
    // const requestId = this.asyncContext.getRequestId();

    try {
      const cacheService = this.getCacheService();
      const cacheKey = this.getCacheKey(actor);

      // Try cache first
      const cached = await cacheService.get<Set<string>>(cacheKey);
      if (cached) {
        this.logger.debug(`Permissions cache hit for ${cacheKey}`);
        const actorId = this.getActorId(actor) ?? '<unknown>';
        this.emitEvent('resolve', 'completed', Date.now() - startTime, actorId);
        return Result.ok(cached);
      }

      // Fetch from DB
      const permissions = await this.fetchPermissionsFromDB(actor);

      // Cache result
      await cacheService.set(cacheKey, permissions, this.cacheTTL);

      const actorId = this.getActorId(actor) ?? '<unknown>';
      this.emitEvent('resolve', 'completed', Date.now() - startTime, actorId);
      return Result.ok(permissions);
    } catch (error) {
      const err = error as Error;
      const actorId = this.getActorId(actor) ?? '<unknown>';
      this.logger.error(
        `Failed to resolve permissions for ${actorId}: ${err.message}`,
        err.stack,
      );

      // Fail-closed: return error with empty permissions
      const authzError: AuthzError = {
        name: 'AuthzError',
        message: err.message,
        code: 'AUTHZ_RESOLVE_FAILED',
        statusCode: 500,
      };

      this.emitEvent('resolve', 'failed', Date.now() - startTime, actorId);
      return Result.fail(authzError);
    }
  }

  /**
   * Check if actor has required permission(s).
   * Fail-closed: any error returns false.
   */
  async checkPermissions(
    actor: Actor,
    requiredPermissions: string | string[],
  ): Promise<Result<boolean>> {
    const startTime = Date.now();

    try {
      const permissionsResult = await this.resolvePermissions(actor);
      if (permissionsResult.isFailure) {
        this.emitEvent(
          'check',
          'failed',
          Date.now() - startTime,
          this.getActorId(actor),
        );
        return Result.fail(permissionsResult.getError());
      }

      const permissions = permissionsResult.getValue();
      const required = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

      const hasAllPermissions = required.every((perm) =>
        permissions.has(perm.toLowerCase()),
      );

      this.emitEvent(
        'check',
        'completed',
        Date.now() - startTime,
        this.getActorId(actor),
      );
      return Result.ok(hasAllPermissions);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to check permissions: ${err.message}`,
        err.stack,
      );

      const authzError: AuthzError = {
        name: 'AuthzError',
        message: err.message,
        code: 'AUTHZ_CHECK_FAILED',
        statusCode: 500,
      };

      this.emitEvent(
        'check',
        'failed',
        Date.now() - startTime,
        this.getActorId(actor),
      );
      return Result.fail(authzError);
    }
  }

  /**
   * Invalidate cache for specific actor (async).
   */
  async invalidateCacheAsync(
    actorType: 'user' | 'service',
    actorId: string,
  ): Promise<Result<void>> {
    try {
      const cacheService = this.getCacheService();
      const cacheKey = `${actorType}:${actorId}`;
      await cacheService.delete(cacheKey);

      this.emitEvent('invalidate', 'completed', 0, actorId);
      return Result.ok();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to invalidate cache: ${err.message}`,
        err.stack,
      );

      const authzError: AuthzError = {
        name: 'AuthzError',
        message: err.message,
        code: 'AUTHZ_INVALIDATE_FAILED',
        statusCode: 500,
      };

      this.emitEvent('invalidate', 'failed', 0, actorId);
      return Result.fail(authzError);
    }
  }

  /**
   * Clear entire authorization cache (async).
   */
  async clearCacheAsync(): Promise<Result<void>> {
    try {
      const cacheService = this.getCacheService();
      await cacheService.clear();

      this.emitEvent('clear', 'completed', 0);
      return Result.ok();
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to clear cache: ${err.message}`, err.stack);

      const authzError: AuthzError = {
        name: 'AuthzError',
        message: err.message,
        code: 'AUTHZ_CLEAR_FAILED',
        statusCode: 500,
      };

      this.emitEvent('clear', 'failed', 0);
      return Result.fail(authzError);
    }
  }

  private async fetchPermissionsFromDB(actor: Actor): Promise<Set<string>> {
    let roleKeys: string[] = [];

    // Guard against invalid input to avoid unsafe property access
    if (!this.isActor(actor)) {
      this.logger.warn(`Invalid actor provided to fetchPermissionsFromDB`);
      return new Set<string>();
    }

    // Ensure actorId is a valid string before using it in DB queries
    const actorId =
      typeof actor.actorId === 'string' ? actor.actorId : undefined;
    if (!actorId) {
      this.logger.warn(`Invalid actor id provided to fetchPermissionsFromDB`);
      return new Set<string>();
    }

    if (actor.actorType === 'user') {
      const user = await this.userModel
        .findOne({ id: actorId, status: 'active' })
        .lean<UserDocument>()
        .exec();
      if (!user) {
        this.logger.warn(`User not found or disabled: ${actorId}`);
        return new Set<string>();
      }
      roleKeys = user.roleKey ? [user.roleKey] : [];
    } else if (actor.actorType === 'service') {
      const service = await this.serviceModel
        .findOne({ id: actorId, status: 'active' })
        .lean<ServiceDocument>()
        .exec();
      if (!service) {
        this.logger.warn(`Service not found or disabled: ${actorId}`);
        return new Set<string>();
      }
      roleKeys = service.roleKeys ?? [];
    }

    if (roleKeys.length === 0) {
      return new Set<string>();
    }

    // Expand roles → permissions
    const roles = await this.roleModel
      .find({ key: { $in: roleKeys }, status: 'active' })
      .lean()
      .exec();

    const permissions = new Set<string>();
    for (const role of roles) {
      for (const permKey of role.permissionKeys ?? []) {
        permissions.add(permKey.toLowerCase());
      }
    }

    return permissions;
  }

  private getActorId(actor?: unknown): string | undefined {
    if (!actor) return undefined;
    if (this.isActor(actor)) {
      return actor.actorId;
    }
    return undefined;
  }

  private isActor(value: unknown): value is Actor {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as { actorType?: unknown; actorId?: unknown };
    const actorType = v.actorType;
    const actorId = v.actorId;
    return (
      (actorType === 'user' || actorType === 'service') &&
      typeof actorId === 'string'
    );
  }

  private getCacheKey(actor: Actor): string {
    if (!this.isActor(actor)) {
      this.logger.warn('getCacheKey called with invalid actor');
      return `unknown:unknown`;
    }
    return `${actor.actorType}:${actor.actorId}`;
  }

  private getCacheService(): ICacheService {
    return this.cacheService;
  }

  private emitEvent(
    operation: 'resolve' | 'check' | 'invalidate' | 'clear',
    status: 'completed' | 'failed',
    duration: number,
    actor?: string,
    error?: Error,
  ): void {
    const event = new AuthzOperationEvent(
      operation,
      status,
      duration,
      actor,
      error,
      this.asyncContext.getRequestId(),
    );
    this.eventEmitter.emit('authz.operation', event);
  }
}
