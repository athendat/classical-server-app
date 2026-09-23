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

/** Initial Balance (minor units, ADR-0008) when SGT_SIMULATED_INITIAL_BALANCE is not set: 10,000.00 */
export const DEFAULT_SIMULATED_INITIAL_BALANCE_MINOR = 1_000_000;

/** Amounts on the SGT wire are 12-digit minor units (ADR-0005, ADR-0008) */
const SGT_AMOUNT_DIGITS = 12;

/**
 * Simulated Issuer behind CARD_SGT_PORT, selected with SGT_MODE=simulated (issue #60).
 * Only for commercial demos outside production: no request leaves the process.
 *
 * - Card activation always succeeds (AP000) with a Card token derived from the Card id
 *   and the initial Balance from SGT_SIMULATED_INITIAL_BALANCE (minor units).
 */
@Injectable()
export class SimulatedSgtCardAdapter implements ISgtCardPort {
  private readonly logger = new Logger(SimulatedSgtCardAdapter.name);
  private readonly initialBalanceMinor: number;

  constructor(private readonly configService: ConfigService) {
    const configured = parseInt(
      this.configService.get<string>('SGT_SIMULATED_INITIAL_BALANCE') ?? '',
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
    _token?: string,
  ): Promise<Result<SgtActivatePinResponse, Error>> {
    const token = this.cardTokenFor(cardId);
    this.logger.log(`[SIMULATED SGT] activate-pin cardId=${cardId} → ${ACTIVATION_CODES.AP000.code}`);

    return Result.ok<SgtActivatePinResponse>({
      ok: true,
      message: ACTIVATION_CODES.AP000.message,
      data: {
        activationCode: ACTIVATION_CODES.AP000.code,
        token,
        balance: this.formatMinor(this.initialBalanceMinor),
      },
    });
  }

  async transfer(
    _request: SgtTransferRequest,
  ): Promise<Result<SgtTransferResponse, Error>> {
    return Result.fail<SgtTransferResponse>(new Error('Not implemented'));
  }

  /** Deterministic fake Card token per Card */
  private cardTokenFor(cardId: string): string {
    return 'SIM' + createHash('sha256').update(cardId).digest('hex').slice(0, 29).toUpperCase();
  }

  private formatMinor(amountMinor: number): string {
    return amountMinor.toString().padStart(SGT_AMOUNT_DIGITS, '0');
  }
}
