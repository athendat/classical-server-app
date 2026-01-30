import { Actor } from 'src/common/interfaces';
import { Result } from 'src/common/types/result.type';

/**
 * Domain port for authorization service.
 * Decouples authorization logic from persistence.
 */
export interface IAuthzService {
  /**
   * Resolve permissions for an actor (user or service).
   * Fail-closed: any error returns empty permissions set.
   *
   * @param actor Actor (user or service) to resolve permissions for
   * @returns Result with permissions set or error
   */
  resolvePermissions(actor: Actor): Promise<Result<Set<string>>>;

  /**
   * Check if actor has required permission(s).
   * Fail-closed: any error returns false.
   *
   * @param actor Actor to check
   * @param requiredPermissions Permission(s) to check
   * @returns Result with boolean or error
   */
  checkPermissions(
    actor: Actor,
    requiredPermissions: string | string[],
  ): Promise<Result<boolean>>;

  /**
   * Invalidate cache for an actor (async).
   *
   * @param actorType Type of actor (user or service)
   * @param actorId ID of actor
   * @returns Result indicating success or error
   */
  invalidateCacheAsync(
    actorType: 'user' | 'service',
    actorId: string,
  ): Promise<Result<void>>;

  /**
   * Clear entire authorization cache (async).
   * Use with caution; useful for testing or mass changes.
   *
   * @returns Result indicating success or error
   */
  clearCacheAsync(): Promise<Result<void>>;
}

/**
 * Authorization error.
 */
export interface AuthzError extends Error {
  code: string;
  statusCode: number;
}
