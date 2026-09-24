import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

import { HttpService } from 'src/common/http/http.service';
import { maskPan, maskCardToken } from 'src/common/helpers/mask-secret';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { Result } from 'src/common/types/result.type';
import {
  ISgtCardPort,
  SgtActivatePinResponse,
  SgtTransferRequest,
  SgtTransferResponse,
} from '../../domain/ports/sgt-card.port';
import { ACTIVATION_CODES } from '../../domain/constants/activation-codes.constant';
import { TRANSFER_CODES } from '../../domain/constants/transfer-codes.constant';
import type { ISgtPinblockPort } from '../../domain/ports/sgt-pinblock.port';
import { Iso4PinblockService } from '../services/iso4-pinblock.service';

/** Transfer codes con los que responde el Issuer (TR003 = el SGT no llegó al Issuer) */
const ISSUER_ANSWER_CODES: readonly string[] = [
  TRANSFER_CODES.TR000.code,
  TRANSFER_CODES.TR001.code,
  TRANSFER_CODES.TR002.code,
];

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
    tml: string,
    aut: string,
    token?: string,
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

      const body: Record<string, string> = {
        pan,
        pin: encryptedPinblock,
        idNumber,
        tml,
        aut,
      };

      if (token) {
        body.token = token;
      }

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
        `SGT /activate-pin responded for cardId=${cardId}: ok=${response?.ok}, activationCode=${response?.data?.activationCode}`,
      );

      // AP002/AP003: el SGT responde ok=false pero el registro fue exitoso,
      // el service necesita el activationCode y el token para persistir la tarjeta
      const activationCode = response?.data?.activationCode;
      const isPartialSuccess =
        activationCode === ACTIVATION_CODES.AP002.code ||
        activationCode === ACTIVATION_CODES.AP003.code;

      if (!response?.ok && !isPartialSuccess) {
        const sgtMessage = this.extractSgtMessage(response);
        this.logger.warn(
          `SGT /activate-pin rejected cardId=${cardId}: ${sgtMessage}`,
        );
        return Result.fail<SgtActivatePinResponse>(new Error(sgtMessage));
      }

      return Result.ok<SgtActivatePinResponse>(response);
    } catch (error: any) {
      const msg = this.extractSgtMessage(error);
      this.logger.error(`SGT /activate-pin failed for cardId=${cardId}: ${msg}`);
      return Result.fail<SgtActivatePinResponse>(
        error instanceof Error && error.message === msg ? error : new Error(msg),
      );
    }
  }

  /**
   * Realiza una transferencia (pago o devolución) contra el SGT.
   * POST {SGT_URL}/transfer
   *
   * Flujo de 2 pasos internos en SGT: transferencia + consulta de saldo
   */
  async transfer(
    request: SgtTransferRequest,
  ): Promise<Result<SgtTransferResponse, Error>> {
    try {
      const baseUrl = this.configService.getOrThrow<string>('SGT_URL');
      const hmacSecret = this.configService.getOrThrow<string>('SGT_HMAC_SECRET');
      const clientId = this.configService.getOrThrow<string>('SGT_CLIENT_ID');
      const apiKey = this.configService.getOrThrow<string>('SGT_API_KEY');

      // Step 1: Decodificar ISO-4 pinblock usando el token para obtener el PIN plano
      const decodeResult = this.iso4PinblockService.decodeIso4Pinblock(request.pin, request.token);
      if (decodeResult.isFailure) {
        this.logger.error(`Failed to decode ISO-4 pinblock for transfer: ${decodeResult.getError().message}`);
        return Result.fail<SgtTransferResponse>(decodeResult.getError());
      }
      const plainPin = decodeResult.getValue();

      // Step 2: Re-encriptar el PIN en formato propietario SGT
      const sgtPinblockResult = this.sgtPinblockPort.encodeAndEncrypt(plainPin);
      if (sgtPinblockResult.isFailure) {
        return Result.fail<SgtTransferResponse>(sgtPinblockResult.getError());
      }
      const encryptedPin = sgtPinblockResult.getValue();

      const body = {
        token: request.token,
        pin: encryptedPin,
        amount: request.amount,
        settlementAmount: request.settlementAmount,
        cardholderAmount: request.cardholderAmount,
        beneficiaryAccount: request.beneficiaryAccount,
        clientReference: request.clientReference,
        type: request.type,
        merchantId: request.merchantId,
        idNumber: request.idNumber,
      };

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

      // Log del payload de salida (datos sensibles enmascarados)
      this.logger.log(
        `[SGT /transfer] → REQUEST ref=${request.clientReference} url=${baseUrl}/transfer payload=${JSON.stringify({
          ...body,
          pin: '***',
          token: maskCardToken(body.token),
          beneficiaryAccount: maskPan(body.beneficiaryAccount),
          idNumber: '***',
        })}`,
      );

      const response: unknown = await this.httpService.post<SgtTransferResponse>(
        `${baseUrl}/transfer`,
        body,
        { headers },
      );

      if (this.isIssuerAnswer(response)) {
        return this.acceptIssuerAnswer(request, response);
      }

      // Sin respuesta del Issuer (TR003, código desconocido o ausente) → fallo
      const sgtMessage = this.extractSgtMessage(response);
      this.logger.warn(
        `[SGT /transfer] ✗ NO ISSUER ANSWER ref=${request.clientReference}: ${sgtMessage} transferCode=${(response as SgtTransferResponse | undefined)?.data?.transferCode}`,
      );
      return Result.fail<SgtTransferResponse>(new Error(sgtMessage));
    } catch (error: any) {
      // SGT puede responder con un estado HTTP no-2xx: si el cuerpo es una
      // respuesta del Issuer, se trata igual que con HTTP 2xx.
      const body: unknown = error?.response?.data;
      if (this.isIssuerAnswer(body)) {
        return this.acceptIssuerAnswer(request, body, error?.response?.status);
      }

      const msg = this.extractSgtMessage(error);
      this.logger.error(
        `[SGT /transfer] ✗ ERROR ref=${request.clientReference}: ${msg} status=${error?.response?.status ?? error?.status ?? 'none'}`,
      );
      return Result.fail<SgtTransferResponse>(
        error instanceof Error && error.message === msg ? error : new Error(msg),
      );
    }
  }

  /**
   * Una respuesta del Issuer es un cuerpo cuyo transfer code es TR000, TR001 o TR002,
   * aunque traiga ok=false. TR003 (el SGT no pudo comunicarse con el Issuer), un código
   * desconocido o ausente no son respuesta del Issuer.
   */
  private isIssuerAnswer(body: unknown): body is SgtTransferResponse {
    const transferCode = (body as SgtTransferResponse | undefined)?.data?.transferCode;
    return ISSUER_ANSWER_CODES.includes(transferCode as string);
  }

  /** Devuelve la respuesta del Issuer tal cual, para que la Settlement persista su código */
  private acceptIssuerAnswer(
    request: SgtTransferRequest,
    answer: SgtTransferResponse,
    httpStatus?: number,
  ): Result<SgtTransferResponse, Error> {
    const line = `[SGT /transfer] ← RESPONSE ref=${request.clientReference}${httpStatus ? ` status=${httpStatus}` : ''} ok=${answer.ok} transferCode=${answer.data?.transferCode} isoResponseCode=${answer.data?.isoResponseCode}`;
    if (answer.data?.transferCode === TRANSFER_CODES.TR001.code) {
      this.logger.warn(`${line} ✗ REJECTED by Issuer`);
    } else {
      this.logger.log(line);
    }
    return Result.ok<SgtTransferResponse>(answer);
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
