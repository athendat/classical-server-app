/**
 * Application Service: NfcAuthorizationService
 *
 * 11-step validation pipeline for NFC payment authorization.
 * Verifies TLV payload, signature, counter, TTL, amount, and nonce atomicity.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import {
  NFC_PAYMENT_INJECTION_TOKENS,
  NFC_TLV_TAGS,
  NFC_REDIS_KEYS,
} from '../domain/constants/nfc-payment.constants';
import type { ITlvCodecPort, TlvField } from '../domain/ports/tlv-codec.port';
import type { IHkdfKeyDerivationPort } from '../domain/ports/hkdf-key-derivation.port';
import type { IEcdsaSignaturePort } from '../domain/ports/ecdsa-signature.port';
import { NfcEnrollmentService } from './nfc-enrollment.service';
import { NfcPrepareService } from './nfc-prepare.service';
import { VaultHttpAdapter } from '../../vault/infrastructure/adapters/vault-http.adapter';
import { AuthorizePaymentRequestDto } from '../dto/authorize-payment-request.dto';
import { TerminalService } from '../../terminals/application/terminal.service';
import { TerminalStatus, TerminalCapability } from '../../terminals/domain/constants/terminal.constants';
import { TransactionsRepository } from '../../transactions/infrastructure/adapters/transactions.repository';
import { TransactionPaymentProcessor } from '../../transactions/application/services/transaction-payment.processor';
import { TransactionStatus } from '../../transactions/domain/entities/transaction.entity';
import { NfcTransactionBuilder } from './nfc-transaction.builder';

export interface TokenData {
  cardId: string;
  amount: number;
  currency: string;
  posId: string;
  txRef: string;
  nonce: string;
  counter: number;
  serverTimestamp: number;
  sessionId: string;
}

export interface AuthorizationResult {
  approved: boolean;
  txId?: string;
  amount?: number;
  currency?: string;
  reason?: string;
  tenantId?: string;
  terminalId?: string;
  sessionId?: string;
  transferCode?: string;
  isoResponseCode?: string;
  status?: TransactionStatus;
}

/** Lua script for atomic nonce consumption */
const CONSUME_NONCE_LUA = `
local key = KEYS[1]
local session = redis.call('GET', key)
if not session then
  return 0
end
local data = cjson.decode(session)
if data.used == true then
  return 0
end
data.used = true
redis.call('SET', key, cjson.encode(data), 'EX', 65)
return 1
`;

/** Maximum counter lookahead window */
const COUNTER_LOOKAHEAD_WINDOW = 10;

/** Maximum token TTL in milliseconds (5 minutes) */
const TOKEN_TTL_MS = 300000;

@Injectable()
export class NfcAuthorizationService {
  private readonly logger = new Logger(NfcAuthorizationService.name);

  constructor(
    @Inject(NFC_PAYMENT_INJECTION_TOKENS.TLV_CODEC_PORT)
    private readonly tlvCodec: ITlvCodecPort,
    @Inject(NFC_PAYMENT_INJECTION_TOKENS.HKDF_KEY_DERIVATION_PORT)
    private readonly hkdfService: IHkdfKeyDerivationPort,
    @Inject(NFC_PAYMENT_INJECTION_TOKENS.ECDSA_SIGNATURE_PORT)
    private readonly ecdsaService: IEcdsaSignaturePort,
    private readonly enrollmentService: NfcEnrollmentService,
    private readonly prepareService: NfcPrepareService,
    private readonly vaultClient: VaultHttpAdapter,
    private readonly terminalService: TerminalService,
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly transactionsRepository: TransactionsRepository,
    private readonly paymentProcessor: TransactionPaymentProcessor,
    private readonly transactionBuilder: NfcTransactionBuilder,
  ) {}

  async authorizePayment(
    dto: AuthorizePaymentRequestDto,
    clientId?: string,
  ): Promise<AuthorizationResult> {
    // Step 1: Decode TLV payload from hex string
    const payloadBuffer = Buffer.from(dto.signedPayload, 'hex');
    const fields = this.tlvCodec.decode(payloadBuffer);
    const tokenData = this.extractTokenFields(fields);

    // Step 2: Look up session in Redis — verify exists and used=false
    const session = await this.prepareService.getSession(tokenData.sessionId);
    if (!session) {
      return { approved: false, reason: 'SESSION_NOT_FOUND' };
    }
    if (session.used) {
      return this.getIdempotentResult(tokenData.sessionId);
    }

    // Step 2b: Terminal lookup (required to derive tenant from OAuth clientId)
    let terminal: Awaited<ReturnType<TerminalService['findByOAuthClientId']>> = null;
    if (!clientId) {
      return { approved: false, reason: 'CLIENT_ID_REQUIRED' };
    }

    terminal = await this.terminalService.findByOAuthClientId(clientId);
    if (!terminal) {
      return { approved: false, reason: 'TERMINAL_NOT_FOUND' };
    }
    if (terminal.status === TerminalStatus.SUSPENDED) {
      return { approved: false, reason: 'TERMINAL_SUSPENDED' };
    }
    if (terminal.status === TerminalStatus.REVOKED) {
      return { approved: false, reason: 'TERMINAL_REVOKED' };
    }

    // Step 2c: Capability check
    if (!terminal.capabilities.includes(TerminalCapability.NFC)) {
      return { approved: false, reason: 'TERMINAL_MISSING_CAPABILITY' };
    }

    // Step 3: Get enrollment and root seed from Vault
    const enrollment = await this.enrollmentService.getEnrollment(tokenData.cardId);
    if (!enrollment || enrollment.status !== 'active') {
      return { approved: false, reason: 'CARD_NOT_ENROLLED' };
    }
    const vaultKeyPath =
      (enrollment as any).vaultKeyPath ??
      `nfc-enrollments/${tokenData.cardId}/root-seed`;
    const rootSeedResult = await this.vaultClient.readKV(vaultKeyPath);
    if (rootSeedResult.isFailure) {
      return { approved: false, reason: 'VAULT_ERROR' };
    }
    const vaultData = rootSeedResult.getValue();
    const rootSeedBase64 =
      vaultData?.data?.data?.rootSeed ?? vaultData?.data?.rootSeed;
    if (!rootSeedBase64 || typeof rootSeedBase64 !== 'string') {
      return { approved: false, reason: 'VAULT_ERROR' };
    }
    const rootSeed = Buffer.from(rootSeedBase64, 'base64');

    // Step 4: Derive ephemeral public key from HKDF(root_seed, counter)
    const { publicKey } = this.hkdfService.deriveEphemeralKeyPair(
      rootSeed,
      tokenData.counter,
    );

    // Step 5: Verify ECDSA signature
    const signedFields = fields.filter(
      (f) => f.tag !== NFC_TLV_TAGS.SIGNATURE,
    );
    const signedPayload = this.tlvCodec.encode(signedFields);
    const signatureField = fields.find(
      (f) => f.tag === NFC_TLV_TAGS.SIGNATURE,
    );
    if (!signatureField) {
      return { approved: false, reason: 'MISSING_SIGNATURE' };
    }
    const isValid = this.ecdsaService.verify(
      signedPayload,
      signatureField.value,
      publicKey,
    );
    if (!isValid) {
      return { approved: false, reason: 'INVALID_SIGNATURE' };
    }

    // Step 6: Verify counter (lookahead window) — read from Redis first, fallback to MongoDB
    const counterKey = NFC_REDIS_KEYS.counterKey(this.configService.get<string>('REDIS_ROOT_KEY') || '', tokenData.cardId);
    const redisCounter = await this.redis.get(counterKey);
    const lastCounter = redisCounter !== null ? parseInt(redisCounter, 10) : enrollment.counter;
    if (tokenData.counter <= lastCounter) {
      return { approved: false, reason: 'COUNTER_TOO_LOW' };
    }
    if (tokenData.counter > lastCounter + COUNTER_LOOKAHEAD_WINDOW) {
      return { approved: false, reason: 'COUNTER_BEYOND_WINDOW' };
    }

    // Step 7: Verify TTL — serverTimestamp within 5 min of now
    const now = Date.now();
    const elapsed = now - tokenData.serverTimestamp;
    if (elapsed > TOKEN_TTL_MS || elapsed < 0) {
      return { approved: false, reason: 'TOKEN_EXPIRED' };
    }

    // Step 8: Verify amount and currency match the POS request
    if (tokenData.amount !== dto.amount || tokenData.currency !== dto.currency) {
      return { approved: false, reason: 'AMOUNT_MISMATCH' };
    }

    // Step 9: Atomic nonce consumption via Redis Lua script
    const consumed = await this.consumeNonceAtomically(tokenData.sessionId);
    if (!consumed) {
      return { approved: false, reason: 'NONCE_ALREADY_USED' };
    }

    // Step 10: Balance check placeholder (deferred to integration)

    // Step 11: Persist Transaction and dispatch to SGT (reuses QR settlement pipeline)
    const { transaction, processPaymentArgs } = this.transactionBuilder.build({
      tokenData,
      enrollment,
      terminal,
    });

    let persisted: Awaited<ReturnType<TransactionsRepository['create']>>;
    let authorizationResult: AuthorizationResult | null = null;
    let processingError: unknown;

    try {
      persisted = await this.transactionsRepository.create(transaction);
      const processingTransaction = await this.transactionsRepository.updateStatus(
        persisted.id,
        TransactionStatus.PROCESSING,
      );
      if (!processingTransaction) {
        throw new Error(`Transaction not found after status update: ${persisted.id}`);
      }
      if (!processingTransaction.cardId) {
        throw new Error(`Transaction missing cardId: ${persisted.id}`);
      }
      try {
        const paymentResult = await this.paymentProcessor.processPayment(
          processingTransaction.id,
          processingTransaction.tenantId,
          processingTransaction.customerId,
          processingTransaction.cardId,
          processPaymentArgs[4],
        );

        authorizationResult = {
          approved: paymentResult.success,
          txId: persisted.id,
          amount: tokenData.amount,
          currency: tokenData.currency,
          sessionId: tokenData.sessionId,
          transferCode: paymentResult.transferCode,
          isoResponseCode: paymentResult.isoResponseCode,
          status: paymentResult.status,
          ...(terminal && { tenantId: terminal.tenantId, terminalId: terminal.terminalId }),
        };
      } catch (err) {
        this.logger.error(
          `SGT dispatch failed for txId=${persisted.id}: ${(err as Error).message}`,
        );

        await this.transactionsRepository.updateStatus(
          persisted.id,
          TransactionStatus.FAILED,
          { processedAt: new Date(), sgtTransferCode: 'SGT_UNREACHABLE' },
        );

        authorizationResult = {
          approved: false,
          txId: persisted.id,
          reason: 'SGT_UNREACHABLE',
          amount: tokenData.amount,
          currency: tokenData.currency,
          sessionId: tokenData.sessionId,
          status: TransactionStatus.FAILED,
          ...(terminal && { tenantId: terminal.tenantId, terminalId: terminal.terminalId }),
        };
      }
    } catch (err) {
      processingError = err;
    } finally {
      const [sessionMarkedResult, enrollmentCounterResult] = await Promise.allSettled([
        this.prepareService.markSessionUsed(tokenData.sessionId),
        this.updateEnrollmentCounter(tokenData.cardId, tokenData.counter),
      ]);

      const finalizationError =
        sessionMarkedResult.status === 'rejected'
          ? {
              stage: 'markSessionUsed',
              reason: sessionMarkedResult.reason,
            }
          : enrollmentCounterResult.status === 'rejected'
            ? {
                stage: 'updateEnrollmentCounter',
                reason: enrollmentCounterResult.reason,
              }
            : null;

      if (finalizationError) {
        if (processingError) {
          this.logger.error(
            `NFC finalization failed at ${finalizationError.stage} after processing error: ${
              (finalizationError.reason as Error).message
            }`,
          );
          throw processingError;
        }
        throw finalizationError.reason;
      }
    }

    if (processingError) {
      throw processingError;
    }

    if (!authorizationResult) {
      throw new Error('NFC authorization finished without a result');
    }

    return authorizationResult;
  }

  private async consumeNonceAtomically(sessionId: string): Promise<boolean> {
    const rootKey = this.configService.get<string>('REDIS_ROOT_KEY') || '';
    const fullKey = rootKey
      ? `${rootKey}:nfc:session:${sessionId}`
      : `nfc:session:${sessionId}`;

    const result = await this.redis.eval(CONSUME_NONCE_LUA, 1, fullKey);
    return result === 1;
  }

  private async getIdempotentResult(
    sessionId: string,
  ): Promise<AuthorizationResult> {
    return { approved: true, reason: 'ALREADY_PROCESSED' };
  }

  private async updateEnrollmentCounter(
    cardId: string,
    newCounter: number,
  ): Promise<void> {
    // Atomically enforce a monotonic enrollment counter using Redis.
    // The counter is only updated if `newCounter` is strictly greater than
    // the currently stored value. This provides replay protection across
    // sessions.
    const counterKey = NFC_REDIS_KEYS.counterKey(this.configService.get<string>('REDIS_ROOT_KEY') || '', cardId);

    // Lua script:
    //  - KEYS[1]: counter key
    //  - ARGV[1]: proposed new counter value (as string)
    // Behavior:
    //  * If no current value exists, set to ARGV[1] and return 1.
    //  * If current < ARGV[1], set to ARGV[1] and return 1.
    //  * Otherwise, do nothing and return 0.
    const UPDATE_COUNTER_LUA = `
      local current = redis.call("GET", KEYS[1])
      if not current then
        redis.call("SET", KEYS[1], ARGV[1])
        return 1
      end
      if tonumber(ARGV[1]) > tonumber(current) then
        redis.call("SET", KEYS[1], ARGV[1])
        return 1
      end
      return 0
    `;

    try {
      const result = await this.redis.eval(
        UPDATE_COUNTER_LUA,
        1,
        counterKey,
        String(newCounter),
      );

      if (result !== 1) {
        // The stored counter is already >= newCounter; this indicates a
        // potential replay or out-of-order token.
        this.logger.warn(
          `Enrollment counter not updated for card ${cardId}: stored value is already >= ${newCounter}`,
        );
        throw new Error('ENROLLMENT_COUNTER_NOT_MONOTONIC');
      }

      this.logger.debug(
        `Enrollment counter for card ${cardId} updated to ${newCounter}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to update enrollment counter for card ${cardId} to ${newCounter}: ${
          (err as Error).message
        }`,
      );
      throw err;
    }
  }

  private extractTokenFields(fields: TlvField[]): TokenData {
    const findField = (tag: number) => fields.find((f) => f.tag === tag);

    return {
      cardId: findField(NFC_TLV_TAGS.CARD_ID)?.value.toString('utf8') || '',
      amount: Number(
        findField(NFC_TLV_TAGS.AMOUNT)?.value.readBigInt64BE() || 0n,
      ),
      currency:
        findField(NFC_TLV_TAGS.CURRENCY)?.value.toString('utf8') || '',
      posId: findField(NFC_TLV_TAGS.POS_ID)?.value.toString('utf8') || '',
      txRef: findField(NFC_TLV_TAGS.TX_REF)?.value.toString('utf8') || '',
      nonce: findField(NFC_TLV_TAGS.NONCE)?.value.toString('hex') || '',
      counter: Number(
        findField(NFC_TLV_TAGS.COUNTER)?.value.readBigInt64BE() || 0n,
      ),
      serverTimestamp: Number(
        findField(NFC_TLV_TAGS.SERVER_TIMESTAMP)?.value.readBigInt64BE() ||
          0n,
      ),
      sessionId:
        findField(NFC_TLV_TAGS.SESSION_ID)?.value.toString('utf8') || '',
    };
  }
}
