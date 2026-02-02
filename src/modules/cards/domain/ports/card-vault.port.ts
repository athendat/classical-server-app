import { Result } from 'src/common/types/result.type';
import { VaultError } from 'src/modules/vault/domain/ports/vault-client.port';

/**
 * Port (interface) for card vault operations.
 * Handles secure storage and retrieval of PAN and pinblock in Vault.
 */
export interface ICardVaultPort {
  /**
   * Save PAN and pinblock to Vault
   * @param cardId - Card identifier
   * @param pan - Primary Account Number (16 digits)
   * @param pinblock - ISO-4 pinblock (32 hex characters)
   * @returns Result<void, VaultError>
   */
  savePanAndPinblock(
    cardId: string,
    pan: string,
    pinblock: string,
  ): Promise<Result<void, VaultError>>;

  /**
   * Retrieve PAN from Vault
   * @param cardId - Card identifier
   * @returns Result<string, VaultError>
   */
  getPan(cardId: string): Promise<Result<string, VaultError>>;

  /**
   * Retrieve pinblock from Vault
   * @param cardId - Card identifier
   * @returns Result<string, VaultError>
   */
  getPinblock(cardId: string): Promise<Result<string, VaultError>>;

  /**
   * Delete PAN and pinblock from Vault
   * @param cardId - Card identifier
   * @returns Result<void, VaultError>
   */
  deletePanAndPinblock(cardId: string): Promise<Result<void, VaultError>>;
}
