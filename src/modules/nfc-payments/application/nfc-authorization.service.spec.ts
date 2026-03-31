/**
 * Unit Tests: NfcAuthorizationService
 *
 * Tests for the 11-step NFC payment authorization pipeline:
 * - TLV decode, session lookup, enrollment/vault, key derivation
 * - Signature verification, counter check, TTL, amount match
 * - Atomic nonce consumption, idempotency
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { NfcAuthorizationService, TokenData } from './nfc-authorization.service';
import { NfcEnrollmentService } from './nfc-enrollment.service';
import { NfcPrepareService, SessionData } from './nfc-prepare.service';
import { VaultHttpAdapter } from '../../vault/infrastructure/adapters/vault-http.adapter';
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
  let mockConfigService: Partial<jest.Mocked<ConfigService>>;

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

    const rootSeedHex = crypto.randomBytes(32).toString('hex');
    mockVaultClient = {
      readKV: jest.fn().mockResolvedValue(
        Result.ok({ data: { value: rootSeedHex } } as any),
      ),
    };

    mockRedis = {
      eval: jest.fn().mockResolvedValue(1),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('app_'),
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
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<NfcAuthorizationService>(NfcAuthorizationService);
  });

  describe('authorizePayment', () => {
    it('should approve a valid payment with correct signature, counter, and amount', async () => {
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(true);
      expect(result.txId).toBeDefined();
      expect(result.amount).toBe(tokenData.amount);
      expect(result.currency).toBe(tokenData.currency);
    });

    it('should reject when session not found', async () => {
      mockPrepareService.getSession!.mockResolvedValueOnce(null);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('SESSION_NOT_FOUND');
    });

    it('should reject when signature is invalid', async () => {
      mockEcdsaService.verify.mockReturnValueOnce(false);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    it('should reject when counter is too low (replay)', async () => {
      // enrollment.counter=5, tokenData.counter=3
      mockEnrollmentService.getEnrollment!.mockResolvedValueOnce({
        ...activeEnrollment,
        counter: 5,
      });
      const { signedPayload, tokenData } = buildValidSignedPayload({ counter: 3 });

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

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

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('COUNTER_BEYOND_WINDOW');
    });

    it('should reject when token is expired', async () => {
      const { signedPayload, tokenData } = buildValidSignedPayload({
        serverTimestamp: Date.now() - 400000, // > 5 min ago
      });

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('TOKEN_EXPIRED');
    });

    it('should reject when amount does not match', async () => {
      const { signedPayload, tokenData } = buildValidSignedPayload({ amount: 1000 });

      const result = await service.authorizePayment({
        signedPayload,
        amount: 2000, // POS sends different amount
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('AMOUNT_MISMATCH');
    });

    it('should reject when nonce already consumed (race condition)', async () => {
      mockRedis.eval.mockResolvedValueOnce(0);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('NONCE_ALREADY_USED');
    });

    it('should reject when card is not enrolled', async () => {
      mockEnrollmentService.getEnrollment!.mockResolvedValueOnce(null);
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('CARD_NOT_ENROLLED');
    });

    it('should return idempotent result for already-used session', async () => {
      mockPrepareService.getSession!.mockResolvedValueOnce({
        ...validSession,
        used: true,
      });
      const { signedPayload, tokenData } = buildValidSignedPayload();

      const result = await service.authorizePayment({
        signedPayload,
        amount: tokenData.amount,
        currency: tokenData.currency,
      });

      expect(result.approved).toBe(true);
      expect(result.reason).toBe('ALREADY_PROCESSED');
    });
  });
});
