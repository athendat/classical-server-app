import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { HttpService } from 'src/common/http/http.service';

import type { ISgtPinblockPort } from '../../domain/ports/sgt-pinblock.port';
import { Iso4PinblockService } from '../services/iso4-pinblock.service';
import { SgtCardAdapter } from './sgt-card.adapter';
import { sgtCardPortProvider } from './sgt-card-port.provider';
import { SimulatedSgtCardAdapter } from './simulated-sgt-card.adapter';

/** Issue #60 — CARD_SGT_PORT is bound according to SGT_MODE=live|simulated (default live). */
describe('sgtCardPortProvider', () => {
  const fakeConfig = (values: Record<string, string | undefined>) =>
    ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

  const resolve = (config: ConfigService) =>
    sgtCardPortProvider.useFactory(
      config,
      {} as HttpService,
      {} as ISgtPinblockPort,
      {} as Iso4PinblockService,
    );

  it('provides the Card/SGT port', () => {
    expect(sgtCardPortProvider.provide).toBe(INJECTION_TOKENS.CARD_SGT_PORT);
  });

  it('binds the real SGT adapter when SGT_MODE is not set', () => {
    expect(resolve(fakeConfig({}))).toBeInstanceOf(SgtCardAdapter);
  });

  it('binds the real SGT adapter when SGT_MODE=live', () => {
    expect(resolve(fakeConfig({ SGT_MODE: 'live' }))).toBeInstanceOf(SgtCardAdapter);
  });

  it('binds the simulated Issuer when SGT_MODE=simulated', () => {
    expect(
      resolve(fakeConfig({ SGT_MODE: 'simulated', ENVIRONMENT: 'SANDBOX' })),
    ).toBeInstanceOf(SimulatedSgtCardAdapter);
  });

  describe('startup warning', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    it('warns in the log that the Issuer is simulated when SGT_MODE=simulated', () => {
      resolve(fakeConfig({ SGT_MODE: 'simulated', ENVIRONMENT: 'SANDBOX' }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('SGT_MODE=simulated'));
    });

    it('does not warn in live mode', () => {
      resolve(fakeConfig({ SGT_MODE: 'live' }));

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
