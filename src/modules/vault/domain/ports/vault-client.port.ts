import { Result } from 'src/common/types/result.type';

/**
 * Vault KV v2 operation result (read/write/delete)
 */
export interface VaultKVData {
  data: Record<string, any>;
  metadata?: {
    created_time: string;
    custom_metadata: Record<string, string>;
    deletion_time: string;
    destroyed: boolean;
    version: number;
  };
}

/**
 * Vault AppRole login response
 */
export interface VaultAuthToken {
  auth: {
    client_token: string;
    policies: string[];
    token_duration: number;
    token_renewable: boolean;
  };
}

/**
 * Vault operation error
 */
export class VaultError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly vaultError: string,
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

/**
 * Port (interface) for Vault client operations.
 * Encapsulates all interactions with HashiCorp Vault KV v2.
 */
export interface IVaultClient {
  /**
   * Authenticate with Vault using AppRole credentials
   */
  login(): Promise<Result<VaultAuthToken, VaultError>>;

  /**
   * Read a secret from Vault KV v2
   */
  readKV(path: string): Promise<Result<VaultKVData, VaultError>>;

  /**
   * Write a secret to Vault KV v2
   */
  writeKV(
    path: string,
    data: Record<string, any>,
  ): Promise<Result<VaultKVData, VaultError>>;

  /**
   * Delete a secret from Vault KV v2 (destroys all versions)
   */
  deleteKV(path: string): Promise<Result<void, VaultError>>;

  /**
   * Get the current auth token (cached)
   */
  getToken(): Promise<Result<string, VaultError>>;
}
