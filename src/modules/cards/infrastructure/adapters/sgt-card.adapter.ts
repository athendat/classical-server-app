import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import axios from 'axios';
import * as https from 'https';

import { HttpService } from 'src/common/http/http.service';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { Result } from 'src/common/types/result.type';
import {
  ISgtCardPort,
  SgtActivatePinResponse,
} from '../../domain/ports/sgt-card.port';
import type { ISgtPinblockPort } from '../../domain/ports/sgt-pinblock.port';

/**
 * Adaptador para comunicación con el servidor SGT (Switch / Módulo Emisor).
 * Implementa ISgtCardPort.
 *
 * Autenticación: HMAC-SHA256
 *   - X-Signature = HEX(HMAC-SHA256(SGT_HMAC_SECRET, JSON.stringify(body) + timestamp))
 *   - X-Timestamp = ISO 8601
 *   - X-Client-ID = SGT_CLIENT_ID
 */
@Injectable()
export class SgtCardAdapter implements ISgtCardPort {
  private readonly logger = new Logger(SgtCardAdapter.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(INJECTION_TOKENS.SGT_PINBLOCK_PORT)
    private readonly sgtPinblockPort: ISgtPinblockPort,
  ) { }

  /**
   * Verifica y activa el PIN de una tarjeta contra el SGT.
   * POST {SGT_URL}/activate-pin
   */
  async activatePin(
    cardId: string,
    pan: string,
    pin: string
  ): Promise<Result<SgtActivatePinResponse, Error>> {
    try {
      const pinblockResult = this.sgtPinblockPort.encodeAndEncrypt(pin);
      if (pinblockResult.isFailure) {
        return Result.fail<SgtActivatePinResponse>(pinblockResult.getError());
      }
      const encryptedPinblock = pinblockResult.getValue();

      const baseUrl = this.configService.getOrThrow<string>('SGT_URL');
      const hmacSecret = this.configService.getOrThrow<string>('SGT_HMAC_SECRET');
      const clientId = this.configService.getOrThrow<string>('SGT_CLIENT_ID');
      const apiKey = this.configService.getOrThrow<string>('SGT_API_KEY');

      const body = { pan, pin: encryptedPinblock };
      const timestamp = new Date().toISOString();
      const payload = JSON.stringify(body) + timestamp;

      const signature = createHmac('sha256', hmacSecret)
        .update(payload)
        .digest('hex');

      const headers = {
        'X-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Client-ID': clientId,
        'apiKey': apiKey,
      };

      this.logger.log(`Calling SGT /activate-pin for cardId=${cardId}`);
      this.logger.log(`SGT URL: ${baseUrl}/activate-pin`);
      this.logger.log(`SGT Headers: ${JSON.stringify(headers)}`);

      try {
        this.logger.log(`Before HTTP POST call (axios directo)...`);
        const axiosResponse = await axios.post(
          `${baseUrl}/activate-pin`,
          body,
          {
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            timeout: 30000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          },
        );
        this.logger.log(`After HTTP POST call - Status: ${axiosResponse.status}`);

        const response = axiosResponse.data as SgtActivatePinResponse;

        this.logger.log(
          `SGT /activate-pin responded for cardId=${cardId}: success=${response?.success}`,
        );

        return Result.ok<SgtActivatePinResponse>(response);
      } catch (httpError: any) {
        const errorMsg = httpError?.message || String(httpError);
        const status = httpError?.response?.status;
        const responseData = httpError?.response?.data;
        this.logger.error(`HTTP request failed [${status}]: ${errorMsg}`);
        if (responseData) {
          this.logger.error(`Response body: ${JSON.stringify(responseData)}`);
        }
        throw httpError;
      }
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SGT /activate-pin failed for cardId=${cardId}: ${msg}`, error);
      return Result.fail<SgtActivatePinResponse>(
        error instanceof Error ? error : new Error(msg),
      );
    }
  }
}
