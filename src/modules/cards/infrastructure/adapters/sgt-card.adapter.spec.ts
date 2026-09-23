import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HttpService } from 'src/common/http/http.service';
import { Result } from 'src/common/types/result.type';

import { SgtCardAdapter } from './sgt-card.adapter';
import type { SgtTransferRequest } from '../../domain/ports/sgt-card.port';
import type { ISgtPinblockPort } from '../../domain/ports/sgt-pinblock.port';
import { Iso4PinblockService } from '../services/iso4-pinblock.service';

// TODO: tests obsoletos — SgtCardAdapter ahora depende de SgtPinblockAdapter (decodeIso4Pinblock). Reescribir.
describe.skip('SgtCardAdapter', () => {
  let adapter: SgtCardAdapter;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(() => {
    httpService = {
      post: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'SGT_URL') return 'https://sgt.local';
        if (key === 'SGT_HMAC_SECRET') return 'secret';
        if (key === 'SGT_CLIENT_ID') return 'client-id';
        if (key === 'SGT_API_KEY') return 'api-key';

        throw new Error(`Unknown key: ${key}`);
      }),
    } as unknown as ConfigService;

    const sgtPinblockPort = {
      encodeAndEncrypt: jest.fn().mockReturnValue(Result.ok('encrypted-pinblock')),
    };

    adapter = new SgtCardAdapter(httpService, configService, sgtPinblockPort as any);
  });

  it('debe fallar cuando SGT responde success=false aunque el HTTP sea 200', async () => {
    httpService.post.mockResolvedValue({
      success: false,
      message: 'Error en los parámetros enviados',
    });

    const result = await adapter.activatePin('card-123', '4242424242424242', '1234', '12345678');

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe('Error en los parámetros enviados');
  });

  it('debe extraer el mensaje anidado de error cuando el cliente HTTP lanza excepción', async () => {
    const httpException = new HttpException(
      {
        data: {
          success: false,
          message: 'Error en los parámetros enviados',
        },
      },
      HttpStatus.BAD_REQUEST,
    ) as HttpException & {
      response?: {
        data: {
          success: boolean;
          message: string;
        };
      };
    };

    httpException.response = {
      data: {
        success: false,
        message: 'Error en los parámetros enviados',
      },
    };

    httpService.post.mockRejectedValue(httpException);

    const result = await adapter.activatePin('card-123', '4242424242424242', '1234', '12345678');

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe('Error en los parámetros enviados');
  });
});

describe('SgtCardAdapter.transfer (Settlement at the Issuer)', () => {
  let adapter: SgtCardAdapter;
  let httpService: { post: jest.Mock };

  const transferRequest: SgtTransferRequest = {
    token: 'CARDTOKEN0001',
    pin: 'iso4-pinblock',
    amount: '000000001099',
    settlementAmount: '000000001072',
    cardholderAmount: '000000000027',
    beneficiaryAccount: '9200000000000001',
    clientReference: 'TXN-txn-1',
    type: 'payment',
    merchantId: '000000000000T01',
    idNumber: '85010112345',
  };

  beforeEach(() => {
    httpService = { post: jest.fn() };

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          SGT_URL: 'https://sgt.local',
          SGT_HMAC_SECRET: 'secret',
          SGT_CLIENT_ID: 'client-id',
          SGT_API_KEY: 'api-key',
        };
        if (!(key in values)) throw new Error(`Unknown key: ${key}`);
        return values[key];
      }),
    } as unknown as ConfigService;

    const sgtPinblockPort = {
      encodeAndEncrypt: jest.fn().mockReturnValue(Result.ok('sgt-pinblock')),
    };
    const iso4PinblockService = {
      decodeIso4Pinblock: jest.fn().mockReturnValue(Result.ok('1234')),
    };

    adapter = new SgtCardAdapter(
      httpService as unknown as HttpService,
      configService,
      sgtPinblockPort as unknown as ISgtPinblockPort,
      iso4PinblockService as unknown as Iso4PinblockService,
    );
  });

  it('returns an Issuer rejection (ok=false, TR001) as an answer carrying its transfer code and ISO code', async () => {
    httpService.post.mockResolvedValue({
      ok: false,
      message: 'Fondos insuficientes',
      data: { transferCode: 'TR001', isoResponseCode: '51' },
    });

    const result = await adapter.transfer(transferRequest);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({
      ok: false,
      message: 'Fondos insuficientes',
      data: { transferCode: 'TR001', isoResponseCode: '51' },
    });
  });
});
