import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HttpService } from 'src/common/http/http.service';
import { Result } from 'src/common/types/result.type';

import { SgtCardAdapter } from './sgt-card.adapter';

describe('SgtCardAdapter', () => {
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