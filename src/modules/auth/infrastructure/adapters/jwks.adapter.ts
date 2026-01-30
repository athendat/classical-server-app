import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import * as crypto from 'crypto';

import { IJwksPort, JwksKey } from '../../domain/ports/jwks.port';

import {
  JwksKeyRotatedEvent,
  JwksKeyInvalidatedEvent,
} from '../../events/auth.events';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import type { IVaultClient } from 'src/modules/vault/domain/ports/vault-client.port';

/**
 * Adaptador JWKS que gestiona claves RSA privadas y públicas en Vault KV v2.
 * - Almacena claves privadas en Vault.
 * - Cachea claves públicas en memoria para validación rápida.
 * - Soporta rotación de claves.
 * - Fail-closed: si no hay clave activa, rechaza operaciones de firma.
 */
@Injectable()
export class JwksAdapter implements IJwksPort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JwksAdapter.name);
  private readonly vaultMount: string;
  private readonly vaultPath: string;
  private readonly keyRotationIntervalMs: number;
  private keysCache: Map<string, JwksKey> = new Map();
  private activeKidCache: string | null = null;
  private rotationTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(INJECTION_TOKENS.VAULT_CLIENT)
    private readonly vaultClient: IVaultClient,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.vaultMount = configService.get<string>('VAULT_KV_MOUNT') || 'secret';
    this.vaultPath = `jwks`;
    this.keyRotationIntervalMs =
      (configService.get<number>('JWKS_KEY_ROTATION_INTERVAL_HOURS') || 24) *
      3600 *
      1000;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing JWKS adapter...');
    try {
      await this.loadKeysFromVault();

      // Si no hay claves después de intentar cargar desde Vault, generar una por defecto
      if (this.keysCache.size === 0) {
        this.logger.warn(
          'No keys available after Vault load. Generating default key...',
        );
        const defaultKey = await this.generateNewKeyPair('jwks-default');
        defaultKey.isActive = true; // Activar la clave por defecto
        this.activeKidCache = defaultKey.kid;
        this.keysCache.set(defaultKey.kid, defaultKey);
        await this.saveKeysToVault();
        this.logger.log('Default JWKS key generated and cached');
      } else if (!this.activeKidCache) {
        // Si hay claves pero ninguna está activa, activar la primera
        const firstKey = Array.from(this.keysCache.values())[0];
        if (firstKey) {
          firstKey.isActive = true;
          this.activeKidCache = firstKey.kid;
          this.keysCache.set(firstKey.kid, firstKey);
          await this.saveKeysToVault();
          this.logger.log(`Activated key ${firstKey.kid}`);
        }
      }

      // Programar rotación automática cada N horas
      this.rotationTimer = setInterval(() => {
        this.rotateKey().catch((err) => this.logger.error(err));
      }, this.keyRotationIntervalMs);
      this.logger.log(
        `JWKS adapter initialized. Next rotation in ${this.keyRotationIntervalMs}ms`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize JWKS adapter', error);
      // Fail-closed: si no podemos cargar claves, el servicio no arranca
      throw error;
    }
  }

  onModuleDestroy(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
  }

  /**
   * Cargar todas las claves desde Vault KV v2.
   */
  private async loadKeysFromVault(): Promise<void> {
    try {
      const result = await this.vaultClient.readKV(this.vaultPath);

      if (!result.isSuccess) {
        this.logger.warn(
          'No JWKS data found in Vault; will create keys on demand',
        );
        return;
      }

      // Safely extract data from VaultKVData result
      const vaultData = result.getValue();
      const kvData = vaultData.data || {};
      const data =
        kvData.data && typeof kvData.data === 'object'
          ? (kvData.data as Record<string, unknown>)
          : kvData;

      for (const [kid, keyData] of Object.entries(data)) {
        const keyObj =
          keyData && typeof keyData === 'object'
            ? (keyData as Record<string, unknown>)
            : {};

        const alg = typeof keyObj['alg'] === 'string' ? keyObj['alg'] : 'RS256';
        const publicKey =
          typeof keyObj['publicKey'] === 'string' ? keyObj['publicKey'] : '';
        const createdAt =
          typeof keyObj['createdAt'] === 'number'
            ? keyObj['createdAt']
            : Date.now();
        const expiresAt =
          typeof keyObj['expiresAt'] === 'number'
            ? keyObj['expiresAt']
            : createdAt + this.keyRotationIntervalMs;
        const isActive =
          typeof keyObj['isActive'] === 'boolean' ? keyObj['isActive'] : false;

        this.keysCache.set(kid, {
          kid,
          alg,
          publicKey,
          createdAt,
          expiresAt,
          isActive,
        });

        if (isActive) {
          this.activeKidCache = kid;
        }
      }

      this.logger.log(`Loaded ${this.keysCache.size} keys from Vault`);
    } catch (error) {
      this.logger.error('Failed to load keys from Vault', error);
      throw error;
    }
  }

  /**
   * Guardar claves en Vault KV v2.
   */
  private async saveKeysToVault(): Promise<void> {
    try {
      const data: Record<string, any> = {};
      for (const [kid, key] of this.keysCache) {
        data[kid] = {
          kid,
          alg: key.alg,
          publicKey: key.publicKey,
          createdAt: key.createdAt,
          expiresAt: key.expiresAt,
          isActive: key.isActive,
        };
      }

      const result = await this.vaultClient.writeKV(this.vaultPath, data);

      if (result.isFailure) {
        throw new Error(
          `Failed to write JWKS to Vault: ${result.getError().message}`,
        );
      }

      this.logger.debug(`Saved JWKS metadata to Vault`);
    } catch (error) {
      this.logger.error('Failed to save keys to Vault', error);
      throw error;
    }
  }

  /**
   * Generar un nuevo par RSA y guardarlo en Vault.
   */
  private async generateNewKeyPair(kid: string): Promise<JwksKey> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    // Guardar clave privada en Vault bajo KV v2 con path separado
    const privateKeyPath = `jwks-private/${kid}`;
    const writeResult = await this.vaultClient.writeKV(privateKeyPath, {
      privateKey,
    });

    if (writeResult.isFailure) {
      throw new Error(
        `Failed to store private key in Vault for kid ${kid}: ${writeResult.getError().message}`,
      );
    }

    const now = Date.now();
    const expiresAt = now + this.keyRotationIntervalMs;

    const key: JwksKey = {
      kid,
      alg: 'RS256',
      publicKey: publicKey,
      createdAt: now,
      expiresAt,
      isActive: false,
    };

    this.keysCache.set(kid, key);
    this.logger.debug(`Generated new RSA key pair with kid ${kid}`);

    return key;
  }

  /**
   * Obtener la clave privada desde Vault para firma.
   */
  private async getPrivateKey(kid: string): Promise<string> {
    const privateKeyPath = `jwks-private/${kid}`;
    const result = await this.vaultClient.readKV(privateKeyPath);

    if (result.isFailure) {
      throw new Error(
        `Private key not found in Vault for kid ${kid}: ${result.getError().message}`,
      );
    }

    const vaultData = result.getValue();
    const kvData = vaultData.data || {};
    const data =
      kvData.data && typeof kvData.data === 'object'
        ? (kvData.data as Record<string, unknown>)
        : kvData;
    const privateKey =
      typeof data.privateKey === 'string' ? data.privateKey : '';

    if (!privateKey) {
      throw new Error(`Private key not found in Vault for kid ${kid}`);
    }

    return privateKey;
  }

  getKey(kid: string): Promise<JwksKey | null> {
    const key = this.keysCache.get(kid);
    if (!key) return Promise.resolve(null);

    // Fail-closed: si está expirada, no devolverla
    if (key.expiresAt < Date.now()) {
      this.logger.warn(`Key ${kid} has expired`);
      return Promise.resolve(null);
    }

    return Promise.resolve(key);
  }

  async getActiveKey(): Promise<JwksKey | null> {
    if (!this.activeKidCache) return null;

    const key = await this.getKey(this.activeKidCache);

    // Si la clave activa ha expirado, rotarla automáticamente
    if (!key && this.activeKidCache) {
      this.logger.warn(
        `Active key ${this.activeKidCache} has expired. Rotating automatically...`,
      );
      try {
        const newKey = await this.rotateKey();
        return newKey;
      } catch (error) {
        this.logger.error('Failed to auto-rotate expired key', error);
        return null;
      }
    }

    return key;
  }

  listKeys(): Promise<JwksKey[]> {
    return Promise.resolve(Array.from(this.keysCache.values()));
  }

  async rotateKey(): Promise<JwksKey> {
    const newKid = `jwks-${Date.now()}`;
    this.logger.log(`Rotating JWKS key to new kid: ${newKid}`);

    try {
      // Generar nueva clave
      const newKey = await this.generateNewKeyPair(newKid);

      // Desactivar clave anterior
      const oldKid = this.activeKidCache;
      if (oldKid) {
        const oldKey = this.keysCache.get(oldKid);
        if (oldKey) {
          oldKey.isActive = false;
          this.keysCache.set(oldKid, oldKey);
        }
      }

      // Activar nueva clave
      newKey.isActive = true;
      this.keysCache.set(newKid, newKey);
      this.activeKidCache = newKid;

      // Persistir en Vault
      await this.saveKeysToVault();

      // Emitir evento
      this.eventEmitter.emit('auth.jwks-key-rotated', {
        type: 'jwks.key_rotated',
        oldKid: oldKid || 'none',
        newKid,
        timestamp: Date.now(),
      } as JwksKeyRotatedEvent);

      this.logger.log(
        `JWKS key rotated successfully. Old kid: ${oldKid}, New kid: ${newKid}`,
      );

      return newKey;
    } catch (error) {
      this.logger.error('Failed to rotate JWKS key', error);
      throw error;
    }
  }

  async invalidateKey(kid: string): Promise<void> {
    const key = this.keysCache.get(kid);
    if (!key) {
      this.logger.warn(`Key ${kid} not found; skipping invalidation`);
      return;
    }

    this.logger.warn(`Invalidating JWKS key: ${kid}`);

    try {
      key.isActive = false;
      key.expiresAt = Date.now(); // Marcar como expirada inmediatamente

      this.keysCache.set(kid, key);

      // Si era la clave activa, rotaremos a una nueva
      if (this.activeKidCache === kid) {
        this.activeKidCache = null;
        // Disparar rotación
        await this.rotateKey();
      }

      // Persistir cambios
      await this.saveKeysToVault();

      // Emitir evento
      this.eventEmitter.emit('auth.jwks-key-invalidated', {
        type: 'jwks.key_invalidated',
        kid,
        reason: 'Manual invalidation',
        timestamp: Date.now(),
      } as JwksKeyInvalidatedEvent);

      this.logger.log(`JWKS key invalidated: ${kid}`);
    } catch (error) {
      this.logger.error('Failed to invalidate key', error);
      throw error;
    }
  }

  /**
   * Retornar kid de la clave activa.
   */
  getActiveKidSync(): string | null {
    return this.activeKidCache;
  }

  /**
   * Retornar clave privada activa (para uso interno en firma).
   */
  async getActivePrivateKey(): Promise<string> {
    if (!this.activeKidCache) {
      throw new Error('No active JWKS key available');
    }

    // Verificar si la clave activa está expirada
    const activeKey = await this.getKey(this.activeKidCache);
    if (!activeKey) {
      this.logger.warn(
        `Active key ${this.activeKidCache} has expired. Rotating automatically...`,
      );
      try {
        const newKey = await this.rotateKey();
        return this.getPrivateKey(newKey.kid);
      } catch (error) {
        this.logger.error('Failed to auto-rotate expired key', error);
        throw new Error('No active JWKS key available for signing');
      }
    }

    return this.getPrivateKey(this.activeKidCache);
  }
}
