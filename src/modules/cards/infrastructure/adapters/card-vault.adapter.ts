import { Injectable, Inject } from '@nestjs/common';
import type { IVaultClient } from 'src/modules/vault/domain/ports/vault-client.port';
import { VaultError } from 'src/modules/vault/domain/ports/vault-client.port';
import { Result } from 'src/common/types/result.type';
import { ICardVaultPort } from '../../domain/ports/card-vault.port';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';

/**
 * Card Vault Adapter
 * Implements ICardVaultPort to store/retrieve card secrets in Vault
 * Paths: cards/{cardId}/pan and cards/{cardId}/pinblock
 */
@Injectable()
export class CardVaultAdapter implements ICardVaultPort {
  constructor(
    @Inject(INJECTION_TOKENS.VAULT_CLIENT)
    private readonly vaultClient: IVaultClient,
  ) {}

  async savePanAndPinblock(
    cardId: string,
    pan: string,
    pinblock: string,
  ): Promise<Result<void, VaultError>> {
    try {
      // Save both PAN and pinblock in one operation
      const result = await this.vaultClient.writeKV(`cards/${cardId}`, {
        pan,
        pinblock,
      });

      if (result.isFailure) {
        return Result.fail(result.getError());
      }

      return Result.ok();
    } catch (error: any) {
      const vaultError = new VaultError(
        500,
        'CARD_VAULT_ERROR',
        `Failed to save PAN and pinblock: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Result.fail(vaultError);
    }
  }

  async getPan(cardId: string): Promise<Result<string, VaultError>> {
    try {
      const result = await this.vaultClient.readKV(`cards/${cardId}`);

      if (result.isFailure) {
        return Result.fail(result.getError());
      }

      const data = result.getValue();
      const pan = data.data?.pan as string | undefined;

      if (!pan) {
        const error = new VaultError(
          404,
          'PAN_NOT_FOUND',
          `PAN not found for card ${cardId}`,
        );
        return Result.fail(error);
      }

      return Result.ok(pan);
    } catch (error: any) {
      const vaultError = new VaultError(
        500,
        'CARD_VAULT_ERROR',
        `Failed to retrieve PAN: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Result.fail(vaultError);
    }
  }

  async getPinblock(cardId: string): Promise<Result<string, VaultError>> {
    try {
      const result = await this.vaultClient.readKV(`cards/${cardId}`);

      if (result.isFailure) {
        return Result.fail(result.getError());
      }

      const data = result.getValue();
      const pinblock = data.data?.pinblock as string | undefined;

      if (!pinblock) {
        const error = new VaultError(
          404,
          'PINBLOCK_NOT_FOUND',
          `Pinblock not found for card ${cardId}`,
        );
        return Result.fail(error);
      }

      return Result.ok(pinblock);
    } catch (error: any) {
      const vaultError = new VaultError(
        500,
        'CARD_VAULT_ERROR',
        `Failed to retrieve pinblock: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Result.fail(vaultError);
    }
  }

  async deletePanAndPinblock(
    cardId: string,
  ): Promise<Result<void, VaultError>> {
    try {
      const result = await this.vaultClient.deleteKV(`cards/${cardId}`);

      if (result.isFailure) {
        return Result.fail(result.getError());
      }

      return Result.ok();
    } catch (error: any) {
      const vaultError = new VaultError(
        500,
        'CARD_VAULT_ERROR',
        `Failed to delete PAN and pinblock: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Result.fail(vaultError);
    }
  }
}
