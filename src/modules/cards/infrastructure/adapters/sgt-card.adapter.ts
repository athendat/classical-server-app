import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

import { HttpService } from 'src/common/http/http.service';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { Result } from 'src/common/types/result.type';
import {
  ISgtCardPort,
  SgtActivatePinResponse,
} from '../../domain/ports/sgt-card.port';
import type { ISgtPinblockPort } from '../../domain/ports/sgt-pinblock.port';
import { Iso4PinblockService } from '../services/iso4-pinblock.service';

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
    private readonly iso4PinblockService: Iso4PinblockService,
  ) { }

  /**
   * Verifica y activa el PIN de una tarjeta contra el SGT.
   * POST {SGT_URL}/activate-pin
   */
  async activatePin(
    cardId: string,
    pan: string,
    pinblock: string,
    idNumber: string,
  ): Promise<Result<SgtActivatePinResponse, Error>> {
    try {
      // Step 1: Decode ISO-4 pinblock to extract the plain PIN
      const decodeResult = this.iso4PinblockService.decodeIso4Pinblock(pinblock, pan);
      if (decodeResult.isFailure) {
        this.logger.error(`Failed to decode ISO-4 pinblock for cardId=${cardId}: ${decodeResult.getError().message}`);
        return Result.fail<SgtActivatePinResponse>(decodeResult.getError());
      }
      const plainPin = decodeResult.getValue();

      // Step 2: Encode and encrypt the plain PIN in SGT proprietary format
      const sgtPinblockResult = this.sgtPinblockPort.encodeAndEncrypt(plainPin);
      if (sgtPinblockResult.isFailure) {
        return Result.fail<SgtActivatePinResponse>(sgtPinblockResult.getError());
      }
      const encryptedPinblock = sgtPinblockResult.getValue();

      const baseUrl = this.configService.getOrThrow<string>('SGT_URL');
      const hmacSecret = this.configService.getOrThrow<string>('SGT_HMAC_SECRET');
      const clientId = this.configService.getOrThrow<string>('SGT_CLIENT_ID');
      const apiKey = this.configService.getOrThrow<string>('SGT_API_KEY');

      const body = {
        pan,
        pin: encryptedPinblock,
        idNumber,
      };

      this.logger.log(`[SgtCardAdapter] activate pin request body ${JSON.stringify(body)}`);

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

      const response = await this.httpService.post<SgtActivatePinResponse>(
        `${baseUrl}/activate-pin`,
        body,
        { headers },
      );

      this.logger.log(
        `SGT /activate-pin responded for cardId=${cardId}: success=${response?.success}`,
      );

      if (!response?.success) {
        const sgtMessage = this.extractSgtMessage(response);
        this.logger.warn(
          `SGT /activate-pin rejected cardId=${cardId}: ${sgtMessage}`,
        );
        return Result.fail<SgtActivatePinResponse>(new Error(sgtMessage));
      }

      return Result.ok<SgtActivatePinResponse>(response);
    } catch (error: any) {
      const msg = this.extractSgtMessage(error);
      this.logger.error(`SGT /activate-pin failed for cardId=${cardId}: ${msg}`, error);
      return Result.fail<SgtActivatePinResponse>(
        error instanceof Error && error.message === msg ? error : new Error(msg),
      );
    }
  }

  private extractSgtMessage(source: unknown): string {
    const message =
      (source instanceof HttpException ? this.readMessage(source.getResponse()) : null) ??
      this.readMessage((source as Record<string, unknown> | undefined)?.response) ??
      this.readMessage(source) ??
      (source instanceof Error ? source.message : null);

    return message ?? 'No fue posible activar el PIN en SGT';
  }

  private readMessage(payload: unknown): string | null {
    if (!payload) {
      return null;
    }

    if (typeof payload === 'string') {
      return payload;
    }

    if (Array.isArray(payload)) {
      const messages = payload.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );

      return messages.length > 0 ? messages.join(', ') : null;
    }

    if (typeof payload !== 'object') {
      return null;
    }

    const record = payload as Record<string, unknown>;

    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      return record.message;
    }

    if (Array.isArray(record.message)) {
      const nestedMessages = record.message.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );

      if (nestedMessages.length > 0) {
        return nestedMessages.join(', ');
      }
    }

    return this.readMessage(record.data) ?? this.readMessage(record.response);
  }
}
