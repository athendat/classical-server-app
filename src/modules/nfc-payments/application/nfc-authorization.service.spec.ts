/**
 * Unit Tests: NfcAuthorizationService
 *
 * Tests for the 11-step NFC payment authorization pipeline:
 * - TLV decode, session lookup, enrollment/vault, key derivation
 * - Signature verification, counter check, TTL, amount match
 * - Atomic nonce consumption, idempotency
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { NfcAuthorizationService, TokenData } from './nfc-authorization.service';
import { NfcEnrollmentService } from './nfc-enrollment.service';
import { NfcPrepareService, SessionData } from './nfc-prepare.service';
import { VaultHttpAdapter } from '../../vault/infrastructure/adapters/vault-http.adapter';
import { TerminalService } from '../../terminals/application/terminal.service';
import { TerminalStatus, TerminalCapability } from '../../terminals/domain/constants/terminal.constants';
import type { TerminalEntity } from '../../terminals/domain/ports/terminal-repository.port';
import {
  NFC_PAYMENT_INJECTION_TOKENS,
  NFC_TLV_TAGS,
} from '../domain/constants/nfc-payment.constants';
import type { ITlvCodecPort, TlvField } from '../domain/ports/tlv-codec.port';
import type { IHkdfKeyDerivationPort } from '../domain/ports/hkdf-key-derivation.port';
import type { IEcdsaSignaturePort } from '../domain/ports/ecdsa-signature.port';
import type { NfcEnrollmentEntity } from '../domain/ports/nfc-enrollment-repository.port';
import { Result } from 'src/common/types/result.type';
import { TlvCodecAdapter } from '../infrastructure/adapters/tlv-codec.adapter';
import { TransactionsRepository } from '../../transactions/infrastructure/adapters/transactions.repository';
import { TransactionPaymentProcessor } from '../../transactions/application/services/transaction-payment.processor';
import { Transaction, TransactionStatus } from '../../transactions/domain/entities/transaction.entity';
import { NfcTransactionBuilder } from './nfc-transaction.builder';

// ── Helpers ──────────────────────────────────────────────────────────

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

/** Build TLV fields from token data */
function buildTlvFields(data: TokenData): TlvField[] {
  const codec = new TlvCodecAdapter();
  const fields: TlvField[] = [];

  const strField = (tag: number, value: string) =>
    fields.push({ tag, value: Buffer.from(value, 'utf8') });

  const int64Field = (tag: number, value: number) => {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(value), 0);
    fields.push({ tag, value: buf });
  };

  const hexField = (tag: number, value: string) =>
    fields.push({ tag, value: Buffer.from(value, 'hex') });

  strField(NFC_TLV_TAGS.CARD_ID, data.cardId);
  int64Field(NFC_TLV_TAGS.AMOUNT, data.amount);
  strField(NFC_TLV_TAGS.CURRENCY, data.currency);
  strField(NFC_TLV_TAGS.POS_ID, data.posId);
  strField(NFC_TLV_TAGS.TX_REF, data.txRef);
  hexField(NFC_TLV_TAGS.NONCE, data.nonce);
  int64Field(NFC_TLV_TAGS.COUNTER, data.counter);
  int64Field(NFC_TLV_TAGS.SERVER_TIMESTAMP, data.serverTimestamp);
  strField(NFC_TLV_TAGS.SESSION_ID, data.sessionId);

  return fields;
}

/** Build a valid signed TLV payload hex string */
function buildValidSignedPayload(overrides?: Partial<TokenData>): {
  signedPayload: string;
  fields: TlvField[];
  tokenData: TokenData;
} {
  const codec = new TlvCodecAdapter();

  const tokenData: TokenData = {
    cardId: 'card-001',
    amount: 1000,
    currency: 'USD',
    posId: 'pos-1',
    txRef: 'tx-ref-1',
    nonce: 'aabbccdd11223344aabbccdd11223344',
    counter: 1,
    serverTimestamp: Date.now(),
    sessionId: 'session-uuid-1',
    ...overrides,
  };

  const dataFields = buildTlvFields(tokenData);
  const dataPayload = codec.encode(dataFields);

  // Generate a dummy signature (72 bytes of zeros — we mock ecdsaService.verify)
  const dummySignature = Buffer.alloc(72, 0);
  const allFields = [
    ...dataFields,
    { tag: NFC_TLV_TAGS.SIGNATURE, value: dummySignature },
  ];

  const fullPayload = codec.encode(allFields);

  return {
    signedPayload: fullPayload.toString('hex'),
    fields: allFields,
    tokenData,
  };
}

// ── Test Suite ───────────────────────────────────────────────────────

describe('NfcAuthorizationService (Unit Tests)', () => {
  let service: NfcAuthorizationService;

  let mockTlvCodec: jest.Mocked<ITlvCodecPort>;
  let mockHkdfService: jest.Mocked<IHkdfKeyDerivationPort>;
  let mockEcdsaService: jest.Mocked<IEcdsaSignaturePort>;
  let mockEnrollmentService: Partial<jest.Mocked<NfcEnrollmentService>>;
  let mockPrepareService: Partial<jest.Mocked<NfcPrepareService>>;
  let mockVaultClient: Partial<jest.Mocked<VaultHttpAdapter>>;
  let mockRedis: { eval: jest.Mock };
  let mockTerminalService: Partial<jest.Mocked<TerminalService>>;
  let mockConfigService: Partial<jest.Mocked<ConfigService>>;
  let mockTransactionsRepository: { create: jest.Mock; updateStatus: jest.Mock };
  let mockPaymentProcessor: { processPayment: jest.Mock };

  // Use the real TLV codec for building test payloads
  const realCodec = new TlvCodecAdapter();

  const activeEnrollment: NfcEnrollmentEntity = {
    id: 'enrollment-id',
    cardId: 'card-001',
    userId: 'user-1',
    devicePublicKey: 'some-key',
    serverPublicKey: 'some-server-key',
    vaultKeyPath: 'nfc-enrollments/card-001/root-seed',
    counter: 0,
    status: 'active',
  };

  const validSession: SessionData = {
    cardId: 'card-001',
    userId: 'user-1',
    nonce: 'aabbccdd11223344aabbccdd11223344',
    counter: 0,
    serverTimestamp: Date.now(),
    sessionId: 'session-uuid-1',
    used: false,
  };

  const activeTerminal: TerminalEntity = {
    terminalId: 'term-001',
    tenantId: 'tenant-001',
    name: 'POS Terminal 1',
    type: 'physical_pos',
    capabilities: [TerminalCapability.NFC, TerminalCapability.CHIP],
    status: TerminalStatus.ACTIVE,
    oauthClientId: 'oauth-client-1',
    createdBy: 'admin',
  };

  // A dummy KeyObject for mocking
  const dummyPublicKey = crypto.createPublicKey(
    crypto.createPrivateKey({
      key: Buffer.concat([
        Buffer.from(
          '3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420',
          'hex',
        ),
        crypto.randomBytes(32),
      ]),
      format: 'der',
      type: 'pkcs8',
    }),
  );

  beforeEach(async () => {
    // Create mock for TLV codec that delegates to real codec
    mockTlvCodec = {
      encode: jest.fn().mockImplementation((fields: TlvField[]) =>
        realCodec.encode(fields),
      ),
      decode: jest.fn().mockImplementation((buffer: Buffer) =>
        realCodec.decode(buffer),
      ),
    };

    mockHkdfService = {
      deriveRootSeed: jest.fn(),
      deriveEphemeralKeyPair: jest.fn().mockReturnValue({
        privateKey: {} as crypto.KeyObject,
        publicKey: dummyPublicKey,
      }),
    };

    mockEcdsaService = {
      sign: jest.fn(),
      verify: jest.fn().mockReturnValue(true),
    };

    mockEnrollmentService = {
      getEnrollment: jest.fn().mockResolvedValue(activeEnrollment),
      getCounterAndIncrement: jest.fn().mockResolvedValue(1),
    };

    mockPrepareService = {
      getSession: jest.fn().mockResolvedValue(validSession),
      markSessionUsed: jest.fn().mockResolvedValue(undefined),
    };

    const rootSeedBase64 = crypto.randomBytes(32).toString('base64');
    mockVaultClient = {
      readKV: jest.fn().mockResolvedValue(
        Result.ok({ data: { data: { rootSeed: rootSeedBase64 } } } as any),
      ),
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      eval: jest.fn().mockResolvedValue(1),
    };

    mockTerminalService = {
      findByOAuthClientId: jest.fn().mockResolvedValue(activeTerminal),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('app_'),
    };

    let storedTransaction: Transaction | null = null;
    mockTransactionsRepository = {
      create: jest.fn().mockImplementation(async (tx: Transaction) => {
        storedTransaction = new Transaction(tx);
        return storedTransaction;
      }),
      updateStatus: jest.fn().mockImplementation(
        async (
          id: string,
          status: TransactionStatus,
          updates?: Record<string, any>,
        ) => {
          storedTransaction = new Transaction({
            ...(storedTransaction ?? {}),
            id,
            status,
            ...updates,
          });
          return storedTransaction;
        },
      ),
    };

    mockPaymentProcessor = {
      processPayment: jest.fn().mockImplementation(
        async (transactionId: string) => ({
          success: true,
          status: TransactionStatus.SUCCESS,
          transferCode: 'TR000',
          isoResponseCode: '00',
          updatedTransaction: new Transaction({
            id: transactionId,
            status: TransactionStatus.SUCCESS,
            sgtTransferCode: 'TR000',
            sgtIsoResponseCode: '00',
          }),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NfcAuthorizationService,
        {
          provide: NFC_PAYMENT_INJECTION_TOKENS.TLV_CODEC_PORT,
          useValue: mockTlvCodec,
        },
        {
          provide: NFC_PAYMENT_INJECTION_TOKENS.HKDF_KEY_DERIVATION_PORT,
          useValue: mockHkdfService,
        },
        {
          provide: NFC_PAYMENT_INJECTION_TOKENS.ECDSA_SIGNATURE_PORT,
          useValue: mockEcdsaService,
        },
        {
          provide: NfcEnrollmentService,
          useValue: mockEnrollmentService,
        },
        {
          provide: NfcPrepareService,
          useValue: mockPrepareService,
        },
        {
          provide: VaultHttpAdapter,
          useValue: mockVaultClient,
        },
        {
          provide: REDIS_TOKEN,
          useValue: mockRedis,
        },
        {
          provide: TerminalService,
          useValue: mockTerminalService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TransactionsRepository,
          useValue: mockTransactionsRepository,
        },
        {
          provide: TransactionPaymentProcessor,
          useValue: mockPaymentProcessor,
        },
        NfcTransactionBuilder,
      ],
    }).compile();

    service = module.get<NfcAuthorizationService>(NfcAuthorizationService);
  });

  describe('authorizePayment', () => {
    it('should approve a valid payment with correct signature, counter, and amount', async () => {
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(true);
      expect(result.txId).toBeDefined();
      expect(result.amount).toBe(tokenData.amount);
      expect(result.currency).toBe(tokenData.currency);
    });

    it('should persist Transaction and dispatch to SGT, returning transferCode/status on success', async () => {
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(mockTransactionsRepository.create).toHaveBeenCalledTimes(1);
      const persisted = mockTransactionsRepository.create.mock.calls[0][0] as Transaction;
      expect(persisted.tenantId).toBe('tenant-001');
      expect(persisted.cardId).toBe(tokenData.cardId);
      expect(persisted.amount).toBe(tokenData.amount);
      expect(persisted.intentId).toBe(tokenData.sessionId);

      expect(mockPaymentProcessor.processPayment).toHaveBeenCalledWith(
        persisted.id,
        'tenant-001',
        expect.any(String),
        tokenData.cardId,
        tokenData.amount * 0.01,
      );
      expect(mockTransactionsRepository.updateStatus).toHaveBeenCalledWith(
        persisted.id,
        TransactionStatus.PROCESSING,
      );

      expect(result.approved).toBe(true);
      expect(result.txId).toBe(persisted.id);
      expect((result as any).transferCode).toBe('TR000');
      expect((result as any).status).toBe(TransactionStatus.SUCCESS);
    });

    it('should propagate SGT rejection (TR001) as approved=false with isoResponseCode', async () => {
      mockPaymentProcessor.processPayment.mockImplementationOnce(
        async (transactionId: string) => ({
          success: false,
          status: TransactionStatus.FAILED,
          transferCode: 'TR001',
          isoResponseCode: '51',
          updatedTransaction: new Transaction({
            id: transactionId,
            status: TransactionStatus.FAILED,
            sgtTransferCode: 'TR001',
            sgtIsoResponseCode: '51',
          }),
        }),
      );
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'oauth-client-1',
      );

      expect(mockTransactionsRepository.create).toHaveBeenCalledTimes(1);
      expect(result.approved).toBe(false);
      expect((result as any).transferCode).toBe('TR001');
      expect((result as any).isoResponseCode).toBe('51');
      expect((result as any).status).toBe(TransactionStatus.FAILED);
      // Nonce/counter must remain consumed (no rollback)
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should approve transaction when SGT returns TR002', async () => {
      mockPaymentProcessor.processPayment.mockImplementationOnce(
        async (transactionId: string) => ({
          success: true,
          status: TransactionStatus.SUCCESS,
          transferCode: 'TR002',
          isoResponseCode: '00',
          updatedTransaction: new Transaction({
            id: transactionId,
            status: TransactionStatus.SUCCESS,
            sgtTransferCode: 'TR002',
            sgtIsoResponseCode: '00',
          }),
        }),
      );

      const { signedPayload, tokenData } = buildValidSignedPayload();
      const result = await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'oauth-client-1',
      );

      expect(result.approved).toBe(true);
      expect((result as any).transferCode).toBe('TR002');
      expect((result as any).status).toBe(TransactionStatus.SUCCESS);
    });

    it('should return failure response when SGT processor throws (unreachable)', async () => {
      mockPaymentProcessor.processPayment.mockRejectedValueOnce(
        new Error('ECONNREFUSED'),
      );
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'oauth-client-1',
      );

      expect(mockTransactionsRepository.create).toHaveBeenCalledTimes(1);
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('SGT_UNREACHABLE');
      expect((result as any).status).toBe(TransactionStatus.FAILED);
      expect(mockTransactionsRepository.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        TransactionStatus.FAILED,
        expect.objectContaining({ sgtTransferCode: 'SGT_UNREACHABLE' }),
      );
    });

    it('should reject when session not found', async () => {
      mockPrepareService.getSession!.mockResolvedValueOnce(null);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('SESSION_NOT_FOUND');
    });

    it('should reject when signature is invalid', async () => {
      mockEcdsaService.verify.mockReturnValueOnce(false);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    it('should NOT persist a Transaction or call SGT when signature is invalid', async () => {
      mockEcdsaService.verify.mockReturnValueOnce(false);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'oauth-client-1',
      );

      expect(mockTransactionsRepository.create).not.toHaveBeenCalled();
      expect(mockPaymentProcessor.processPayment).not.toHaveBeenCalled();
    });

    it('should reject when counter is too low (replay)', async () => {
      // enrollment.counter=5, tokenData.counter=3
      mockEnrollmentService.getEnrollment!.mockResolvedValueOnce({
        ...activeEnrollment,
        counter: 5,
      });
      const { signedPayload, tokenData } = buildValidSignedPayload({ counter: 3 });

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('COUNTER_TOO_LOW');
    });

    it('should reject when counter exceeds lookahead window', async () => {
      // enrollment.counter=5, tokenData.counter=20
      mockEnrollmentService.getEnrollment!.mockResolvedValueOnce({
        ...activeEnrollment,
        counter: 5,
      });
      const { signedPayload, tokenData } = buildValidSignedPayload({ counter: 20 });

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('COUNTER_BEYOND_WINDOW');
    });

    it('should reject when token is expired', async () => {
      const { signedPayload, tokenData } = buildValidSignedPayload({
        serverTimestamp: Date.now() - 400000, // > 5 min ago
      });

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('TOKEN_EXPIRED');
    });

    it('should reject when amount does not match', async () => {
      const { signedPayload, tokenData } = buildValidSignedPayload({ amount: 1000 });

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: 2000, // POS sends different amount
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('AMOUNT_MISMATCH');
    });

    it('should reject when nonce already consumed (race condition)', async () => {
      mockRedis.eval.mockResolvedValueOnce(0);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('NONCE_ALREADY_USED');
    });

    it('should reject when card is not enrolled', async () => {
      mockEnrollmentService.getEnrollment!.mockResolvedValueOnce(null);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('CARD_NOT_ENROLLED');
    });

    // ── Terminal validation tests (Slice 5) ──────────────────────────

    it('should reject with CLIENT_ID_REQUIRED when OAuth client id is missing', async () => {
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('CLIENT_ID_REQUIRED');
      expect(mockTransactionsRepository.create).not.toHaveBeenCalled();
      expect(mockPaymentProcessor.processPayment).not.toHaveBeenCalled();
    });

    it('should reject with TERMINAL_NOT_FOUND when clientId has no terminal', async () => {
      mockTerminalService.findByOAuthClientId!.mockResolvedValueOnce(null);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'unknown-client',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('TERMINAL_NOT_FOUND');
    });

    it('should reject with TERMINAL_SUSPENDED when terminal is suspended', async () => {
      mockTerminalService.findByOAuthClientId!.mockResolvedValueOnce({
        ...activeTerminal,
        status: TerminalStatus.SUSPENDED,
      });
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('TERMINAL_SUSPENDED');
    });

    it('should reject with TERMINAL_REVOKED when terminal is revoked', async () => {
      mockTerminalService.findByOAuthClientId!.mockResolvedValueOnce({
        ...activeTerminal,
        status: TerminalStatus.REVOKED,
      });
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('TERMINAL_REVOKED');
    });

    it('should reject with TERMINAL_MISSING_CAPABILITY when terminal lacks nfc', async () => {
      mockTerminalService.findByOAuthClientId!.mockResolvedValueOnce({
        ...activeTerminal,
        capabilities: [TerminalCapability.MAGNETIC_STRIPE],
      });
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'oauth-client-1',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('TERMINAL_MISSING_CAPABILITY');
    });

    it('should include tenantId and terminalId in approved response', async () => {
      mockTerminalService.findByOAuthClientId!.mockResolvedValueOnce({
        ...activeTerminal,
        tenantId: 't1',
        terminalId: 'term1',
      });
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        { signedPayload, amount: tokenData.amount, currency: tokenData.currency },
        'oauth-client-1',
      );

      expect(result.approved).toBe(true);
      expect(result.tenantId).toBe('t1');
      expect(result.terminalId).toBe('term1');
    });

    it('should not log sensitive cryptographic data (SIG-DEBUG)', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const { signedPayload, tokenData } = buildValidSignedPayload();

      await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      const sigDebugCalls = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('SIG-DEBUG'),
      );
      expect(sigDebugCalls).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it('should return idempotent result for already-used session', async () => {
      mockPrepareService.getSession!.mockResolvedValueOnce({
        ...validSession,
        used: true,
      });
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment(
        {
          signedPayload,
          amount: tokenData.amount,
          currency: tokenData.currency,
        },
        'oauth-client-1',
      );

      expect(result.approved).toBe(true);
      expect(result.reason).toBe('ALREADY_PROCESSED');
    });
  });
});
