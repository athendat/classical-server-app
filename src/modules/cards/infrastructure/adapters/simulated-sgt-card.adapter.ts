import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { Result } from 'src/common/types/result.type';
import {
  ISgtCardPort,
  SgtActivatePinResponse,
  SgtTransferRequest,
  SgtTransferResponse,
} from '../../domain/ports/sgt-card.port';
import { ACTIVATION_CODES } from '../../domain/constants/activation-codes.constant';
import { TRANSFER_CODES } from '../../domain/constants/transfer-codes.constant';

/** Initial Balance (minor units, ADR-0008) when SGT_SIMULATED_INITIAL_BALANCE is not set: 10,000.00 */
export const DEFAULT_SIMULATED_INITIAL_BALANCE_MINOR = 1_000_000;

/** Amounts whose cents are 99 (e.g. 10.99) are rejected by the simulated Issuer with TR001 */
export const SIMULATED_REJECTION_CENTS = 99;

/** TRANSFER_CODES has no insufficient-funds code: the simulator answers TR001 with this message */
const INSUFFICIENT_FUNDS_MESSAGE = 'Transferencia rechazada: fondos insuficientes';

/** Amounts on the SGT wire are 12-digit minor units (ADR-0005, ADR-0008) */
const SGT_AMOUNT_DIGITS = 12;

/**
 * Simulated Issuer behind CARD_SGT_PORT, selected with SGT_MODE=simulated (issue #60).
 * Only for commercial demos outside production: no request leaves the process.
 *
 * - Card activation always succeeds (AP000) with a Card token derived from the Card id
 *   and the Card's current Balance (the initial Balance for a Card token not seen yet).
 * - Transfer (Settlement) answers TR000 and the resulting Balance (previous − amount).
 *   Balances live in memory per Card token, seeded with the initial Balance the first
 *   time a Card token is seen (so a restart resets every Card to the initial Balance).
 * - Deterministic rejection: an amount ending in 99 cents answers TR001 and keeps the Balance.
 * - Insufficient funds: an amount above the current Balance answers TR001 and keeps the Balance,
 *   so the Balance never goes negative.
 */
@Injectable()
export class SimulatedSgtCardAdapter implements ISgtCardPort {
  private readonly logger = new Logger(SimulatedSgtCardAdapter.name);
  private readonly initialBalanceMinor: number;
  /** Balance per Card token, in minor units. In memory: a restart resets every Card to the initial Balance. */
  private readonly balancesByCardToken = new Map<string, number>();

  constructor(private readonly configService: ConfigService) {
    const configured = parseInt(
      String(this.configService.get<string | number>('SGT_SIMULATED_INITIAL_BALANCE') ?? ''),
      10,
    );
    this.initialBalanceMinor = Number.isFinite(configured)
      ? configured
      : DEFAULT_SIMULATED_INITIAL_BALANCE_MINOR;
  }

  async activatePin(
    cardId: string,
    _pan: string,
    _pinblock: string,
    _idNumber: string,
    _tml: string,
    _aut: string,
    _cardToken?: string,
  ): Promise<Result<SgtActivatePinResponse, Error>> {
    const cardToken = this.cardTokenFor(cardId);
    const balanceMinor = this.balanceOf(cardToken);
    this.logger.log(`[SIMULATED SGT] activate-pin cardId=${cardId} → ${ACTIVATION_CODES.AP000.code}`);

    return Result.ok<SgtActivatePinResponse>({
      ok: true,
      message: ACTIVATION_CODES.AP000.message,
      data: {
        activationCode: ACTIVATION_CODES.AP000.code,
        token: cardToken,
        balance: this.formatMinor(balanceMinor),
      },
    });
  }

  async transfer(
    request: SgtTransferRequest,
  ): Promise<Result<SgtTransferResponse, Error>> {
    const amountMinor = parseInt(request.amount, 10);

    if (amountMinor % 100 === SIMULATED_REJECTION_CENTS) {
      return this.reject(request, TRANSFER_CODES.TR001.message);
    }

    const previousMinor = this.balanceOf(request.token);
    if (amountMinor > previousMinor) {
      return this.reject(request, INSUFFICIENT_FUNDS_MESSAGE);
    }
    const balanceMinor = previousMinor - amountMinor;
    this.balancesByCardToken.set(request.token, balanceMinor);

    this.logger.log(
      `[SIMULATED SGT] transfer ref=${request.clientReference} amount=${request.amount} → ${TRANSFER_CODES.TR000.code}`,
    );

    return Result.ok<SgtTransferResponse>({
      ok: true,
      message: TRANSFER_CODES.TR000.message,
      data: {
        transferCode: TRANSFER_CODES.TR000.code,
        balance: this.formatMinor(balanceMinor),
      },
    });
  }

  /**
   * TR001 rejection, Balance untouched and no Balance on the wire. Returned as
   * ok(ok=false, TR001) so the Settlement records the Issuer's rejection code.
   */
  private reject(
    request: SgtTransferRequest,
    message: string,
  ): Result<SgtTransferResponse, Error> {
    this.logger.log(
      `[SIMULATED SGT] transfer ref=${request.clientReference} amount=${request.amount} → ${TRANSFER_CODES.TR001.code} (${message})`,
    );
    return Result.ok<SgtTransferResponse>({
      ok: false,
      message,
      data: { transferCode: TRANSFER_CODES.TR001.code },
    });
  }

  /** Current Balance of a Card token (minor units); an unseen Card token is seeded with the initial Balance */
  private balanceOf(cardToken: string): number {
    if (!this.balancesByCardToken.has(cardToken)) {
      this.balancesByCardToken.set(cardToken, this.initialBalanceMinor);
    }
    return this.balancesByCardToken.get(cardToken)!;
  }

  /** Deterministic fake Card token per Card */
  private cardTokenFor(cardId: string): string {
    return 'SIM' + createHash('sha256').update(cardId).digest('hex').slice(0, 29).toUpperCase();
  }

  private formatMinor(amountMinor: number): string {
    return amountMinor.toString().padStart(SGT_AMOUNT_DIGITS, '0');
  }
}
