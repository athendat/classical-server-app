import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService as AxiosHttpService } from '@nestjs/axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { throwError } from 'rxjs';

import {
  captureLogs,
  findLeakedSecrets,
  LogCapture,
  serializeForLog,
} from 'src/common/testing/log-capture';
import { HttpService } from './http.service';

const PAN = '4539578763621486';
const PINBLOCK = '9F3A51C2E07B4D6A18C5F2903E7D6B41';
const ID_NUMBER = '85010112345';
const API_KEY = 'sgt-api-key-value';

/** An SGT HTTP 400 for a request carrying the PAN, a PIN block, the idNumber and the apiKey */
function sgtHttpError(responseData: Record<string, unknown>) {
  const requestBody = { pan: PAN, pin: PINBLOCK, idNumber: ID_NUMBER };
  const config = {
    url: 'https://sgt.test/activate-pin',
    method: 'post',
    data: JSON.stringify(requestBody),
    headers: new AxiosHeaders({ apiKey: API_KEY }),
  };
  const axiosError = new AxiosError(
    'Request failed with status code 400',
    'ERR_BAD_REQUEST',
    config,
    {},
    {
      status: 400,
      statusText: 'Bad Request',
      data: responseData,
      headers: {},
      config,
    },
  );
  return { requestBody, axiosError };
}

describe('HttpService', () => {
  let logs: LogCapture;

  beforeEach(() => {
    logs = captureLogs();
  });

  afterEach(() => {
    logs.restore();
  });

  it('an SGT HTTP error whose body carries the PAN or a PIN block reaches no log, and still surfaces its status', async () => {
    const { requestBody, axiosError } = sgtHttpError({
      ok: false,
      message: 'Parámetros inválidos',
      echo: { pan: PAN, pin: PINBLOCK, idNumber: ID_NUMBER },
    });
    const axios = { post: jest.fn(() => throwError(() => axiosError)) };
    const httpService = new HttpService(axios as unknown as AxiosHttpService);

    const call = httpService.post('https://sgt.test/activate-pin', requestBody);

    await expect(call).rejects.toBeInstanceOf(HttpException);
    await expect(call).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(
      findLeakedSecrets(logs.text(), {
        PAN,
        'PIN block': PINBLOCK,
        idNumber: ID_NUMBER,
        'SGT API key': API_KEY,
      }),
    ).toEqual([]);
  });

  it('the error it throws carries the SGT response status and body, but not the request body or headers', async () => {
    const sgtBody = {
      ok: false,
      message: 'Parámetros inválidos',
      data: { activationCode: 'AP001' },
    };
    const { requestBody, axiosError } = sgtHttpError(sgtBody);
    const axios = { post: jest.fn(() => throwError(() => axiosError)) };
    const httpService = new HttpService(axios as unknown as AxiosHttpService);

    const error = await httpService
      .post('https://sgt.test/activate-pin', requestBody)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as { response: unknown }).response).toEqual({
      status: 400,
      data: sgtBody,
    });
    expect(
      findLeakedSecrets(serializeForLog(error), {
        PAN,
        'PIN block': PINBLOCK,
        idNumber: ID_NUMBER,
        'SGT API key': API_KEY,
      }),
    ).toEqual([]);
  });
});
