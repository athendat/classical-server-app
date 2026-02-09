import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios, { AxiosInstance } from 'axios';
import {
  IVaultClient,
  VaultKVData,
  VaultAuthToken,
  VaultError,
} from '../../domain/ports/vault-client.port';
import { VaultOperationEvent } from '../../events/vault-operation.event';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { Result } from 'src/common/types/result.type';

/**
 * HTTP adapter for Vault client using axios.
 * Implements IVaultClient port with Result pattern error handling.
 * Handles token lifecycle (login, renew, unwrap wrapped tokens).
 */
@Injectable()
export class VaultHttpAdapter implements IVaultClient {
  private readonly logger = new Logger(VaultHttpAdapter.name);
  private readonly httpClient: AxiosInstance;

  private token: string | null = null;
  private tokenExpire: Date | null = null;
  private isRenewable = false;

  private readonly vaultAddr: string;
  private readonly vaultNamespace: string | undefined;
  private readonly kvMount: string;
  private readonly timeoutMs: number;
  private readonly roleId: string;
  private secretId: string | undefined;
  private readonly secretIdWrapped: string | undefined;
  private readonly tokenRenewSafetyWindowSec: number;
  private readonly vaultToken: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly asyncContext: AsyncContextService,
  ) {
    this.vaultAddr = this.config.get<string>('VAULT_ADDR') || '';
    this.vaultNamespace = this.config.get<string>('VAULT_NAMESPACE');
    this.kvMount = this.config.get<string>('VAULT_KV_MOUNT') || 'secret';
    this.timeoutMs = this.config.get<number>('VAULT_TIMEOUT_MS') || 5000;
    this.roleId = this.config.get<string>('VAULT_ROLE_ID') || '';
    this.secretId = this.config.get<string>('VAULT_SECRET_ID');
    this.secretIdWrapped = this.config.get<string>('VAULT_SECRET_ID_WRAPPED');
    this.vaultToken = this.config.get<string>('VAULT_TOKEN');
    this.tokenRenewSafetyWindowSec =
      this.config.get<number>('VAULT_TOKEN_RENEW_SAFETY_WINDOW_SEC') || 300;

    this.httpClient = axios.create({
      baseURL: this.vaultAddr,
      timeout: this.timeoutMs,
      headers: {
        'X-Vault-Namespace': this.vaultNamespace || '',
      },
    });

    // Si hay un token de Vault configurado, usarlo directamente
    if (this.vaultToken) {
      this.token = this.vaultToken;
      this.tokenExpire = new Date(Date.now() + 86400 * 1000); // 24 horas
      this.isRenewable = false; // No renovable, es un token de raíz
      this.httpClient.defaults.headers.common['X-Vault-Token'] =
        this.vaultToken;
      this.logger.log('Using pre-configured Vault token');
    }
  }

  async login(): Promise<Result<VaultAuthToken, VaultError>> {
    try {
      // const requestId = this.asyncContext.getRequestId();

      // If wrapped token, unwrap first
      if (this.secretIdWrapped) {
        this.logger.debug('Unwrapping secret ID from wrapped token (one-time)');
        const unwrapResult = await this.unwrapToken();
        if (unwrapResult.isFailure) {
          this.emitEvent('login', undefined, 'failed', unwrapResult.getError());
          return Result.fail(unwrapResult.getError());
        }
        // secretId is now the unwrapped value
      }

      const response = await this.httpClient.post<VaultAuthToken>(
        '/v1/auth/approle/login',
        {
          role_id: this.roleId,
          secret_id: this.secretId,
        },
      );

      // Narrow response.data to a known shape to avoid unsafe any/member access
      const responseData = response.data as unknown as {
        auth: {
          client_token: string;
          token_renewable: boolean;
          token_duration?: number;
        };
      };

      const authData = responseData.auth;
      this.token = authData.client_token;
      this.isRenewable = authData.token_renewable;

      // Calculate token expiration
      const durationMs = (authData.token_duration || 3600) * 1000;
      this.tokenExpire = new Date(Date.now() + durationMs);

      this.httpClient.defaults.headers.common['X-Vault-Token'] = this.token;

      this.logger.log(
        `Successfully authenticated with Vault (token renewable: ${this.isRenewable})`,
      );
      this.emitEvent('login', undefined, 'completed');

      return Result.ok(response.data);
    } catch (error) {
      const vaultError = this.handleError(error, 'login');
      this.emitEvent('login', undefined, 'failed', vaultError);
      return Result.fail(vaultError);
    }
  }

  async readKV(path: string): Promise<Result<VaultKVData, VaultError>> {
    try {
      const tokenResult = await this.getToken();
      if (tokenResult.isFailure) {
        this.emitEvent('read', path, 'failed', tokenResult.getError());
        return Result.fail(tokenResult.getError());
      }

      const fullPath = `/v1/${this.kvMount}/data/${this.vaultNamespace}/${path}`;
      const response = await this.httpClient.get<VaultKVData>(fullPath);
      console.log({ response })

      this.logger.debug(`Read secret from Vault: ${path}`);
      this.emitEvent('read', path, 'completed');

      return Result.ok(response.data);
    } catch (error) {
      const vaultError = this.handleError(error, 'read', path);
      this.emitEvent('read', path, 'failed', vaultError);
      return Result.fail(vaultError);
    }
  }

  async writeKV(
    path: string,
    data: Record<string, any>,
  ): Promise<Result<VaultKVData, VaultError>> {
    try {
      const tokenResult = await this.getToken();
      if (tokenResult.isFailure) {
        this.emitEvent('write', path, 'failed', tokenResult.getError());
        return Result.fail(tokenResult.getError());
      }

      const fullPath = `/v1/${this.kvMount}/data/${this.vaultNamespace}/${path}`;
      const response = await this.httpClient.post<VaultKVData>(fullPath, {
        data,
      });

      this.logger.debug(`Wrote secret to Vault: ${path}`);
      this.emitEvent('write', path, 'completed');

      return Result.ok(response.data);
    } catch (error) {
      const vaultError = this.handleError(error, 'write', path);
      this.emitEvent('write', path, 'failed', vaultError);
      return Result.fail(vaultError);
    }
  }

  async deleteKV(path: string): Promise<Result<void, VaultError>> {
    try {
      const tokenResult = await this.getToken();
      if (tokenResult.isFailure) {
        this.emitEvent('delete', path, 'failed', tokenResult.getError());
        return Result.fail(tokenResult.getError());
      }

      const fullPath = `/v1/${this.kvMount}/metadata/${this.vaultNamespace}/${path}`;
      await this.httpClient.delete(fullPath);

      this.logger.debug(`Deleted secret from Vault: ${path}`);
      this.emitEvent('delete', path, 'completed');

      return Result.ok();
    } catch (error) {
      const vaultError = this.handleError(error, 'delete', path);
      this.emitEvent('delete', path, 'failed', vaultError);
      return Result.fail(vaultError);
    }
  }

  async getToken(): Promise<Result<string, VaultError>> {
    // If token valid and within safety window, return it
    if (
      this.token &&
      this.tokenExpire &&
      Date.now() <
        this.tokenExpire.getTime() - this.tokenRenewSafetyWindowSec * 1000
    ) {
      return Result.ok(this.token);
    }

    // Try to renew if renewable
    if (this.isRenewable && this.token) {
      this.logger.debug('Token approaching expiration, attempting renewal');
      const renewResult = await this.renewToken();
      if (renewResult.isSuccess) {
        return Result.ok(this.token);
      }
      // Fall through to re-login if renewal fails
      this.logger.warn('Token renewal failed, re-logging in');
    }

    // Re-login
    const loginResult = await this.login();
    if (loginResult.isSuccess) {
      return Result.ok(this.token!);
    }
    return Result.fail(loginResult.getError());
  }

  /**
   * Private helper methods
   */

  private async renewToken(): Promise<Result<void, VaultError>> {
    try {
      const response = await this.httpClient.post<{
        auth?: { token_duration?: number };
      }>('/v1/auth/token/renew-self', {});

      const responseData = response.data as
        | { auth?: { token_duration?: number } }
        | undefined;
      const authData = responseData?.auth;
      const durationMs = (authData?.token_duration ?? 3600) * 1000;
      this.tokenExpire = new Date(Date.now() + durationMs);

      this.logger.debug('Token renewal successful');
      return Result.ok();
    } catch (error) {
      const vaultError = this.handleError(error, 'renew');
      return Result.fail(vaultError);
    }
  }

  private async unwrapToken(): Promise<Result<void, VaultError>> {
    try {
      const response = await this.httpClient.post<{
        data?: { secret_id?: string };
      }>('/v1/sys/wrapping/unwrap', {
        token: this.secretIdWrapped,
      });

      // Replace secretId with unwrapped value
      const unwrapData = response.data?.data;
      if (unwrapData?.secret_id) {
        this.secretId = unwrapData.secret_id;
        this.logger.debug('Secret ID unwrapped successfully');
        return Result.ok();
      }

      throw new Error('Unwrapped token missing secret_id field');
    } catch (error) {
      const vaultError = this.handleError(error, 'unwrap');
      return Result.fail(vaultError);
    }
  }

  private handleError(
    error: any,
    operation: string,
    path?: string,
  ): VaultError {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 500;

      const responseData: unknown = error.response?.data;
      let vaultErrorMessage = error.message;

      if (responseData && typeof responseData === 'object') {
        const dataObj = responseData as Record<string, unknown>;
        const errorsVal = dataObj['errors'];
        if (
          Array.isArray(errorsVal) &&
          errorsVal.length > 0 &&
          typeof errorsVal[0] === 'string'
        ) {
          vaultErrorMessage = errorsVal[0];
        } else if (typeof dataObj['message'] === 'string') {
          vaultErrorMessage = dataObj['message'];
        }
      }

      let message = `Vault ${operation} failed`;
      if (path) {
        message += ` for path: ${path}`;
      }
      message += ` (${statusCode}): ${vaultErrorMessage}`;

      this.logger.error(message);

      return new VaultError(statusCode, vaultErrorMessage, message);
    }

    const errObj: unknown = error;
    const errMsg =
      typeof errObj === 'object' &&
      errObj !== null &&
      'message' in errObj &&
      typeof (errObj as { message: unknown }).message === 'string'
        ? (errObj as { message: string }).message
        : String(errObj);
    const message = `Vault ${operation} error: ${errMsg}`;
    this.logger.error(message);
    return new VaultError(500, errMsg, message);
  }

  /**
   * PAN (Primary Account Number) specific operations
   */

  /** Guardar un PAN en Vault */
  async savePan(
    tenantId: string,
    pan: string,
  ): Promise<Result<string, VaultError>> {
    try {
      // Limpiar espacios y guiones
      const cleanPan = pan.replace(/[\s-]/g, '');

      // Validar que sea numérico y tenga longitud válida
      if (!/^\d{13,19}$/.test(cleanPan)) {
        const error = new VaultError(
          400,
          'Invalid PAN format',
          'PAN must be 13-19 numeric digits',
        );
        this.emitEvent('write', `tenants/${tenantId}/pan`, 'failed', error);
        return Result.fail(error);
      }

      const vaultPath = `tenants/${tenantId}/pan`;
      const writeResult = await this.writeKV(vaultPath, {
        pan: cleanPan,
        savedAt: new Date().toISOString(),
        last4: cleanPan.slice(-4),
      });

      if (!writeResult.isSuccess) {
        return Result.fail(writeResult.getError());
      }

      this.logger.debug(`PAN saved for tenant: ${tenantId}`);
      return Result.ok(vaultPath);
    } catch (error) {
      const vaultError = this.handleError(error, 'write', `tenants/${tenantId}/pan`);
      this.emitEvent('write', `tenants/${tenantId}/pan`, 'failed', vaultError);
      return Result.fail(vaultError);
    }
  }

  /** Recuperar un PAN del Vault (sin enmascarar) */
  async getPan(
    tenantId: string,
  ): Promise<Result<string, VaultError>> {
    try {
      const vaultPath = `tenants/${tenantId}/pan`;
      const readResult = await this.readKV(vaultPath);

      if (!readResult.isSuccess) {
        return Result.fail(readResult.getError());
      }

      const vaultData = readResult.getValue();
      const panData = vaultData.data as any;

      if (!panData?.pan) {
        const error = new VaultError(
          404,
          'PAN not found',
          `PAN not found in Vault for tenant: ${tenantId}`,
        );
        this.emitEvent('read', vaultPath, 'failed', error);
        return Result.fail(error);
      }

      this.logger.debug(`PAN retrieved for tenant: ${tenantId}`);
      return Result.ok(panData.pan as string);
    } catch (error) {
      const vaultError = this.handleError(error, 'read', `tenants/${tenantId}/pan`);
      this.emitEvent('read', `tenants/${tenantId}/pan`, 'failed', vaultError);
      return Result.fail(vaultError);
    }
  }

  /** Eliminar un PAN del Vault */
  async deletePan(
    tenantId: string,
  ): Promise<Result<void, VaultError>> {
    try {
      const vaultPath = `tenants/${tenantId}/pan`;
      const deleteResult = await this.deleteKV(vaultPath);

      if (!deleteResult.isSuccess) {
        return Result.fail(deleteResult.getError());
      }

      this.logger.debug(`PAN deleted for tenant: ${tenantId}`);
      return Result.ok();
    } catch (error) {
      const vaultError = this.handleError(error, 'delete', `tenants/${tenantId}/pan`);
      this.emitEvent('delete', `tenants/${tenantId}/pan`, 'failed', vaultError);
      return Result.fail(vaultError);
    }
  }

  /** Verificar si un PAN existe en Vault */
  async existsPan(
    tenantId: string,
  ): Promise<boolean> {
    try {
      const result = await this.getPan(tenantId);
      return result.isSuccess;
    } catch (error) {
      return false;
    }
  }

  private emitEvent(
    operation: 'login' | 'read' | 'write' | 'delete' | 'renew' | 'unwrap',
    path: string | undefined,
    status: 'completed' | 'failed',
    error?: VaultError,
  ): void {
    try {
      const requestId = this.asyncContext.getRequestId();
      const event = new VaultOperationEvent(
        operation,
        path,
        status,
        error,
        requestId,
      );
      this.eventEmitter.emit('vault.operation', event);
    } catch (err) {
      this.logger.warn(`Failed to emit Vault operation event: ${err}`);
    }
  }
}
