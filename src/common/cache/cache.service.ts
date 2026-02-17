import { Injectable, Logger } from '@nestjs/common';

import Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';

import { ICacheService } from './cache.interface';
import { ConfigService } from '@nestjs/config';

/**
 * In-memory cache implementation using Map with TTL support.
 * Suitable for single-instance deployments.
 */
@Injectable()
export class CacheService implements ICacheService {
  private readonly logger = new Logger(CacheService.name);

  // Private properties
  private ttl: number = 60; // Default TTL en segundos
  private readonly rootKey: string = '';

  /**
   * Constructor
   */
  constructor(
    @InjectRedis() private readonly _redisClient: Redis,
    private readonly configService: ConfigService,
  ) {
    // Obtener root key from env variable
    const rootKeyFromEnv = this.configService.get<string>('REDIS_ROOT_KEY');
    this.rootKey = rootKeyFromEnv ? rootKeyFromEnv : '';
  }

  /**
   * La función establece un valor en el caché usando una clave específica.
   * @param {string} key - Una cadena que representa la clave bajo la cual se almacenará el valor en
   * la memoria caché.
   * @param {any} value - El parámetro de valor son los datos que desea almacenar en la memoria
   * caché. Puede ser de cualquier tipo, como una cadena, un número, un objeto o una matriz.
   * @param ttl - Time to live, tiempo en segundos que cada registro debe vivir en el caché.
   * por defecto toma el valor de la variable de entorno REDIS_TTL.
   * @returns una Promesa que se resuelve en void.
   */
  async set<T>(key: string, value: T, ttl: number = this.ttl): Promise<void> {
    // Set key on cache. if ttl is equal to 0, the key will never expire
    // Convertir ttl de segundos a millisegundos
    const ttlInMilliseconds = ttl === 0 ? 0 : ttl * 1000;
    await this._redisClient.set(
      `${this.rootKey}:${key}`,
      JSON.stringify(value),
      'PX',
      ttlInMilliseconds,
    );

    // Poner log de comprobacion de que se guardo el valor
    this.logger.debug(`Cache set: ${this.rootKey}:${key}:${value} with TTL: ${ttl} seconds`);

    const cachedValue = await this._redisClient.get(`${this.rootKey}:${key}`);
    this.logger.debug(`Cache get after set: ${this.rootKey}:${key}:${cachedValue}`);

  }

  /**
   * La función `getRegistryByKey` recupera un valor del caché basado en una clave determinada.
   * @param {string} key - Una cadena que representa la clave utilizada para recuperar un valor del
   * registro.
   * @returns Se devuelve el valor recuperado del caché con la clave proporcionada. Si la clave no existe, se devuelve null.
   */
  async getByKey<T>(key: string): Promise<T | null> {
    const value = await this._redisClient.get(`${this.rootKey}:${key}`);
    return value ? (JSON.parse(value) as T) : null;
  }

  /**
   * La función `getByPattern` recupera valores del caché que coinciden con un patrón dado.
   * @param {string} pattern - Una cadena que representa el patrón utilizado para buscar claves en
   * el caché.
   * @returns Se devuelve el valor recuperado del caché que coincide con el patrón proporcionado. Si no se encuentra ninguna coincidencia, se devuelve null.
   */
  async getByPattern<T>(pattern: string): Promise<T | null> {
    const keys = await this._redisClient.keys(`${this.rootKey}:${pattern}`);
    if (keys.length === 0) {
      return null;
    }
    const values = await this._redisClient.mget(...keys);
    // Asumimos que solo queremos el primer valor que coincide con el patrón
    const firstValue = values.find((value) => value !== null);
    return firstValue ? (JSON.parse(firstValue) as T) : null;
  }

  /**
   * La función `delete` elimina una clave específica del caché.
   * @param {string} key - Una cadena que representa la clave que se desea eliminar del caché.
   */
  async delete(key: string): Promise<void> {
    await this._redisClient.del(`${this.rootKey}:${key}`);
  }

  /**
   * La función `clear` borra todas las entradas del caché.
   */
  async clear(): Promise<void> {
    await this._redisClient.flushdb();
  }
}
