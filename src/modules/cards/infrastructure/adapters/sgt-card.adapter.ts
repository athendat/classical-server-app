import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

import { HttpService } from 'src/common/http/http.service';
import { Result } from 'src/common/types/result.type';
import {
  ISgtCardPort,
  SgtActivatePinResponse,
} from '../../domain/ports/sgt-card.port';

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
  ) {}

  /**
   * Verifica y activa el PIN de una tarjeta contra el SGT.
   * POST {SGT_URL}/activate-pin
   */
  async activatePin(
    cardId: string,
    pan: string,
    pinblock: string
  ): Promise<Result<SgtActivatePinResponse, Error>> {
    try {
      const baseUrl = this.configService.getOrThrow<string>('SGT_URL');
      const hmacSecret = this.configService.getOrThrow<string>('SGT_HMAC_SECRET');
      const clientId = this.configService.getOrThrow<string>('SGT_CLIENT_ID');

      const body = { pan, pin: pinblock };
      const timestamp = new Date().toISOString();
      const payload = JSON.stringify(body) + timestamp;

      const signature = createHmac('sha256', hmacSecret)
        .update(payload)
        .digest('hex');

      this.logger.log(`Calling SGT /activate-pin for cardId=${cardId}`);

      const response = await this.httpService.post<SgtActivatePinResponse>(
        `${baseUrl}/activate-pin`,
        body,
        {
          headers: {
            'X-Signature': signature,
            'X-Timestamp': timestamp,
            'X-Client-ID': clientId,
          },
        },
      );

      this.logger.log(
        `SGT /activate-pin responded for cardId=${cardId}: success=${response?.success}`,
      );

      return Result.ok<SgtActivatePinResponse>(response);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SGT /activate-pin failed for cardId=${cardId}: ${msg}`, error);
      return Result.fail<SgtActivatePinResponse>(
        error instanceof Error ? error : new Error(msg),
      );
    }
  }
}
