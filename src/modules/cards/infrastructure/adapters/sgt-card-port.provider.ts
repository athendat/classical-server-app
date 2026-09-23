import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';

import type { ISgtCardPort } from '../../domain/ports/sgt-card.port';
import { parseSgtMode } from '../../domain/constants/sgt-mode.constant';
import { SgtCardAdapter } from './sgt-card.adapter';
import { SimulatedSgtCardAdapter } from './simulated-sgt-card.adapter';

/**
 * Binds CARD_SGT_PORT according to SGT_MODE (issue #60):
 * - live (default): the real SGT over HTTP.
 * - simulated: an in-process simulated Issuer, for commercial demos outside production.
 *
 * Both adapters are registered as providers and built by Nest. Neither constructor
 * calls SGT or requires the SGT_* variables, so building the unused one is harmless.
 */
export const sgtCardPortProvider = {
  provide: INJECTION_TOKENS.CARD_SGT_PORT,
  inject: [ConfigService, SgtCardAdapter, SimulatedSgtCardAdapter],
  useFactory: (
    configService: ConfigService,
    liveAdapter: SgtCardAdapter,
    simulatedAdapter: SimulatedSgtCardAdapter,
  ): ISgtCardPort => {
    const mode = parseSgtMode(configService.get<string>('SGT_MODE'));

    if (mode === 'simulated') {
      new Logger('SgtCardPort').warn(
        'SGT_MODE=simulated: the Issuer is SIMULATED. No request reaches SGT; Card activations and ' +
          'Settlements are fake. For commercial demos only, never in production.',
      );
      return simulatedAdapter;
    }

    return liveAdapter;
  },
};
