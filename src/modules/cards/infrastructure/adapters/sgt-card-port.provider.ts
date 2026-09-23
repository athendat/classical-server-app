import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { HttpService } from 'src/common/http/http.service';

import type { ISgtCardPort } from '../../domain/ports/sgt-card.port';
import type { ISgtPinblockPort } from '../../domain/ports/sgt-pinblock.port';
import { Iso4PinblockService } from '../services/iso4-pinblock.service';
import { SgtCardAdapter } from './sgt-card.adapter';
import { SimulatedSgtCardAdapter } from './simulated-sgt-card.adapter';

export type SgtMode = 'live' | 'simulated';

/**
 * Binds CARD_SGT_PORT according to SGT_MODE (issue #60):
 * - live (default): the real SGT over HTTP.
 * - simulated: an in-process simulated Issuer, for commercial demos outside production.
 */
export const sgtCardPortProvider = {
  provide: INJECTION_TOKENS.CARD_SGT_PORT,
  inject: [ConfigService, HttpService, INJECTION_TOKENS.SGT_PINBLOCK_PORT, Iso4PinblockService],
  useFactory: (
    configService: ConfigService,
    httpService: HttpService,
    sgtPinblockPort: ISgtPinblockPort,
    iso4PinblockService: Iso4PinblockService,
  ): ISgtCardPort => {
    const mode = (configService.get<string>('SGT_MODE') ?? 'live') as SgtMode;

    if (mode === 'simulated') {
      new Logger('SgtCardPort').warn(
        'SGT_MODE=simulated: the Issuer is SIMULATED. No request reaches SGT; Card activations and ' +
          'Settlements are fake. For commercial demos only — never in production.',
      );
      return new SimulatedSgtCardAdapter(configService);
    }

    return new SgtCardAdapter(httpService, configService, sgtPinblockPort, iso4PinblockService);
  },
};
