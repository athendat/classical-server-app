import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { HttpService } from 'src/common/http/http.service';

import { Iso4PinblockService } from '../services/iso4-pinblock.service';
import { SgtCardAdapter } from './sgt-card.adapter';
import { sgtCardPortProvider } from './sgt-card-port.provider';
import { SimulatedSgtCardAdapter } from './simulated-sgt-card.adapter';

/** Issue #60 — CARD_SGT_PORT is bound according to SGT_MODE=live|simulated (default live). */
describe('sgtCardPortProvider', () => {
  const fakeConfig = (values: Record<string, string | undefined>) =>
    ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

  const liveAdapter = {} as SgtCardAdapter;
  const simulatedAdapter = {} as SimulatedSgtCardAdapter;

  const resolve = (config: ConfigService) =>
    sgtCardPortProvider.useFactory(config, liveAdapter, simulatedAdapter);

  it('provides the Card/SGT port', () => {
    expect(sgtCardPortProvider.provide).toBe(INJECTION_TOKENS.CARD_SGT_PORT);
  });

  it('binds the real SGT adapter when SGT_MODE is not set', () => {
    expect(resolve(fakeConfig({}))).toBe(liveAdapter);
  });

  it('binds the real SGT adapter when SGT_MODE=live', () => {
    expect(resolve(fakeConfig({ SGT_MODE: 'live' }))).toBe(liveAdapter);
  });

  it('binds the simulated Issuer when SGT_MODE=simulated', () => {
    expect(resolve(fakeConfig({ SGT_MODE: 'simulated', ENVIRONMENT: 'SANDBOX' }))).toBe(
      simulatedAdapter,
    );
  });

  it('refuses an unknown SGT_MODE', () => {
    expect(() => resolve(fakeConfig({ SGT_MODE: 'mock' }))).toThrow('SGT_MODE');
  });

  it('resolves both adapters through Nest DI', async () => {
    const moduleFor = (mode: string) =>
      Test.createTestingModule({
        providers: [
          { provide: ConfigService, useValue: fakeConfig({ SGT_MODE: mode }) },
          { provide: HttpService, useValue: {} },
          { provide: INJECTION_TOKENS.SGT_PINBLOCK_PORT, useValue: {} },
          { provide: Iso4PinblockService, useValue: {} },
          SgtCardAdapter,
          SimulatedSgtCardAdapter,
          sgtCardPortProvider,
        ],
      }).compile();

    const live = await moduleFor('live');
    expect(live.get(INJECTION_TOKENS.CARD_SGT_PORT)).toBeInstanceOf(SgtCardAdapter);

    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const simulated = await moduleFor('simulated');
    warn.mockRestore();
    expect(simulated.get(INJECTION_TOKENS.CARD_SGT_PORT)).toBeInstanceOf(SimulatedSgtCardAdapter);
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
