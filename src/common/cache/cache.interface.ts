/**
 * Cache service interface for abstraction over different cache implementations.
 * Allows future swapping between in-memory, Redis, etc.
 */
export interface ICacheService {
  /**
   * Get a value from cache by key
   */
  getByKey<T>(key: string): Promise<T | null>;

  /**
   * Get values from cache by pattern
   */
  getByPattern<T>(pattern: string): Promise<T | null>;

  /**
   * Set a value in cache with TTL in seconds
   */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;

  /**
   * Delete a key from cache
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all cache entries
   */
  clear(): Promise<void>;
}
