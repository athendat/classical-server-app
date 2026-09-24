import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService as AxiosHttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders } from 'axios';
import { throwError } from 'rxjs';

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

/** The error the real HttpService throws when SGT answers with a non-2xx status and this body */
async function sgtHttpError(status: number, body: unknown): Promise<unknown> {
  const config = { url: 'https://sgt.local/transfer', method: 'post', headers: new AxiosHeaders() };
  const axiosError = new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, {
    status,
    statusText: '',
    data: body,
    headers: {},
    config,
  });
  const axios = { post: jest.fn(() => throwError(() => axiosError)) };
  return new HttpService(axios as unknown as AxiosHttpService).post(config.url, {}).catch((error: unknown) => error);
}

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

  it('recovers the Issuer rejection when SGT answers it with a non-2xx HTTP status', async () => {
    const body = {
      ok: false,
      message: 'Transacción denegada por el emisor',
      data: { transferCode: 'TR001', isoResponseCode: '05' },
    };
    // What HttpService throws on a non-2xx: HttpException carrying { status, data }
    httpService.post.mockRejectedValue(await sgtHttpError(HttpStatus.UNPROCESSABLE_ENTITY, body));

    const result = await adapter.transfer(transferRequest);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(body);
  });

  it('fails when there is no Issuer answer (no response from SGT)', async () => {
    // What HttpService throws when the request got no response (timeout, connection refused)
    httpService.post.mockRejectedValue(
      new HttpException('No se recibió respuesta del servidor', HttpStatus.REQUEST_TIMEOUT),
    );

    const result = await adapter.transfer(transferRequest);

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe('No se recibió respuesta del servidor');
  });

  it('returns TR002 with ok=false (transfer done, Balance query failed) as an Issuer answer', async () => {
    const body = { ok: false, message: 'Consulta de saldo fallida', data: { transferCode: 'TR002' } };
    httpService.post.mockResolvedValue(body);

    const result = await adapter.transfer(transferRequest);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(body);
  });

  it('fails on TR003: SGT could not reach the Issuer, so there is no Issuer answer', async () => {
    httpService.post.mockResolvedValue({
      ok: false,
      message: 'Error de comunicación',
      data: { transferCode: 'TR003' },
    });

    const result = await adapter.transfer(transferRequest);

    expect(result.isFailure).toBe(true);
  });

  it('fails on a transfer code that is not an Issuer answer code, e.g. a proxy error body', async () => {
    const body = { ok: false, message: 'Bad Gateway', data: { transferCode: 'GW502' } };
    httpService.post.mockRejectedValue(await sgtHttpError(HttpStatus.BAD_GATEWAY, body));

    const result = await adapter.transfer(transferRequest);

    expect(result.isFailure).toBe(true);
  });

  it('fails when SGT answers ok=false without a transfer code', async () => {
    httpService.post.mockResolvedValue({ ok: false, message: 'Error en los parámetros enviados' });

    const result = await adapter.transfer(transferRequest);

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe('Error en los parámetros enviados');
  });
});

describe('SgtCardAdapter.activatePin (Card activation at the Issuer)', () => {
  let adapter: SgtCardAdapter;
  let httpService: { post: jest.Mock };

  const activate = () =>
    adapter.activatePin('card-1', '4539578763621486', 'iso4-pinblock', '85010112345', '00012345', '654321');

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

    adapter = new SgtCardAdapter(
      httpService as unknown as HttpService,
      configService,
      { encodeAndEncrypt: jest.fn().mockReturnValue(Result.ok('sgt-pinblock')) } as unknown as ISgtPinblockPort,
      { decodeIso4Pinblock: jest.fn().mockReturnValue(Result.ok('1234')) } as unknown as Iso4PinblockService,
    );
  });

  it('returns an Issuer rejection (ok=false, AP001) as an answer carrying its activation code and ISO code', async () => {
    const body = {
      ok: false,
      message: 'Registro rechazado por el emisor',
      data: { activationCode: 'AP001', isoResponseCode: '14' },
    };
    httpService.post.mockResolvedValue(body);

    const result = await activate();

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(body);
  });
});
