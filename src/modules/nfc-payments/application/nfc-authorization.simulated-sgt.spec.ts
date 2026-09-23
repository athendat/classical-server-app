/**
 * Issue #60 — SGT_MODE=simulated: an NFC Authorization settles through the same
 * Settlement path as QR (ADR-0003), with the simulated Issuer on CARD_SGT_PORT.
 *
 * Real: NfcAuthorizationService, NfcTransactionBuilder, TLV codec,
 * TransactionPaymentProcessor and SimulatedSgtCardAdapter.
 * Faked: persistence, Vault, Redis, key derivation and ECDSA verification.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { Result } from 'src/common/types/result.type';
import { SocketGateway } from 'src/sockets/sockets.gateway';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { CardStatusEnum } from 'src/modules/cards/domain/enums';
import { CardsRepository } from 'src/modules/cards/infrastructure/adapters/card.repository';
import { CardVaultAdapter } from 'src/modules/cards/infrastructure/adapters/card-vault.adapter';
import { SimulatedSgtCardAdapter } from 'src/modules/cards/infrastructure/adapters/simulated-sgt-card.adapter';
import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';
import { TenantVaultService } from 'src/modules/tenants/infrastructure/services/tenant-vault.service';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';

import { NfcAuthorizationService } from './nfc-authorization.service';
import { NfcEnrollmentService } from './nfc-enrollment.service';
import { NfcPrepareService } from './nfc-prepare.service';
import { NfcTransactionBuilder } from './nfc-transaction.builder';
import { VaultHttpAdapter } from '../../vault/infrastructure/adapters/vault-http.adapter';
import { TerminalService } from '../../terminals/application/terminal.service';
import { TerminalCapability, TerminalStatus } from '../../terminals/domain/constants/terminal.constants';
import { NFC_PAYMENT_INJECTION_TOKENS, NFC_TLV_TAGS } from '../domain/constants/nfc-payment.constants';
import type { TlvField } from '../domain/ports/tlv-codec.port';
import { TlvCodecAdapter } from '../infrastructure/adapters/tlv-codec.adapter';
import { TransactionPaymentProcessor } from '../../transactions/application/services/transaction-payment.processor';
import { Transaction, TransactionStatus } from '../../transactions/domain/entities/transaction.entity';
import { TransactionsRepository } from '../../transactions/infrastructure/adapters/transactions.repository';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';
const CARD_ID = 'card-001';
const SESSION_ID = 'session-uuid-1';
const NONCE = 'aabbccdd11223344aabbccdd11223344';

function signedPayloadFor(amountMinor: number): string {
  const codec = new TlvCodecAdapter();
  const fields: TlvField[] = [];
  const str = (tag: number, v: string) => fields.push({ tag, value: Buffer.from(v, 'utf8') });
  const int64 = (tag: number, v: number) => {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(v), 0);
    fields.push({ tag, value: buf });
  };
  str(NFC_TLV_TAGS.CARD_ID, CARD_ID);
  int64(NFC_TLV_TAGS.AMOUNT, amountMinor);
  str(NFC_TLV_TAGS.CURRENCY, 'USD');
  str(NFC_TLV_TAGS.POS_ID, 'pos-1');
  str(NFC_TLV_TAGS.TX_REF, 'tx-ref-1');
  fields.push({ tag: NFC_TLV_TAGS.NONCE, value: Buffer.from(NONCE, 'hex') });
  int64(NFC_TLV_TAGS.COUNTER, 1);
  int64(NFC_TLV_TAGS.SERVER_TIMESTAMP, Date.now());
  str(NFC_TLV_TAGS.SESSION_ID, SESSION_ID);
  fields.push({ tag: NFC_TLV_TAGS.SIGNATURE, value: Buffer.alloc(72, 0) });
  return codec.encode(fields).toString('hex');
}

describe('NfcAuthorizationService with the simulated Issuer (SGT_MODE=simulated)', () => {
  let service: NfcAuthorizationService;
  let cardsRepository: { findById: jest.Mock; update: jest.Mock };
  let transactionsRepository: { create: jest.Mock; updateStatus: jest.Mock };

  beforeEach(async () => {
    const adapter = new SimulatedSgtCardAdapter({
      get: jest.fn((key: string) =>
        key === 'SGT_SIMULATED_INITIAL_BALANCE' ? '250000' : undefined,
      ),
    } as unknown as ConfigService);
    const activation = await adapter.activatePin(CARD_ID, '4242424242424242', 'pb', '85010112345', 't', 'a');
    const cardToken = activation.getValue().data!.token!;

    cardsRepository = {
      findById: jest.fn().mockResolvedValue({ id: CARD_ID, status: CardStatusEnum.ACTIVE, token: cardToken }),
      update: jest.fn(),
    };

    let stored: Transaction | null = null;
    transactionsRepository = {
      create: jest.fn().mockImplementation(async (tx: Transaction) => (stored = new Transaction(tx))),
      updateStatus: jest.fn().mockImplementation(async (id: string, status: TransactionStatus, updates?: object) =>
        (stored = new Transaction({ ...(stored ?? {}), id, status, ...updates })),
      ),
    };

    const dummyPublicKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NfcAuthorizationService,
        NfcTransactionBuilder,
        TransactionPaymentProcessor,
        { provide: NFC_PAYMENT_INJECTION_TOKENS.TLV_CODEC_PORT, useValue: new TlvCodecAdapter() },
        {
          provide: NFC_PAYMENT_INJECTION_TOKENS.HKDF_KEY_DERIVATION_PORT,
          useValue: {
            deriveRootSeed: jest.fn(),
            deriveEphemeralKeyPair: jest.fn().mockReturnValue({ privateKey: {}, publicKey: dummyPublicKey }),
          },
        },
        {
          provide: NFC_PAYMENT_INJECTION_TOKENS.ECDSA_SIGNATURE_PORT,
          useValue: { sign: jest.fn(), verify: jest.fn().mockReturnValue(true) },
        },
        {
          provide: NfcEnrollmentService,
          useValue: {
            getEnrollment: jest.fn().mockResolvedValue({
              id: 'enrollment-id',
              cardId: CARD_ID,
              userId: 'user-1',
              devicePublicKey: 'k',
              serverPublicKey: 'k',
              vaultKeyPath: `nfc-enrollments/${CARD_ID}/root-seed`,
              counter: 0,
              status: 'active',
            }),
            getCounterAndIncrement: jest.fn().mockResolvedValue(1),
          },
        },
        {
          provide: NfcPrepareService,
          useValue: {
            getSession: jest.fn().mockResolvedValue({
              cardId: CARD_ID,
              userId: 'user-1',
              nonce: NONCE,
              counter: 0,
              serverTimestamp: Date.now(),
              sessionId: SESSION_ID,
              used: false,
            }),
            markSessionUsed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: VaultHttpAdapter,
          useValue: {
            readKV: jest.fn().mockResolvedValue(
              Result.ok({ data: { data: { rootSeed: crypto.randomBytes(32).toString('base64') } } }),
            ),
          },
        },
        { provide: REDIS_TOKEN, useValue: { get: jest.fn().mockResolvedValue(null), eval: jest.fn().mockResolvedValue(1) } },
        {
          provide: TerminalService,
          useValue: {
            findByOAuthClientId: jest.fn().mockResolvedValue({
              terminalId: 'term-001',
              tenantId: 'tenant-001',
              name: 'POS Terminal 1',
              type: 'physical_pos',
              capabilities: [TerminalCapability.NFC],
              status: TerminalStatus.ACTIVE,
              oauthClientId: 'oauth-client-1',
              createdBy: 'admin',
            }),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('app_') } },
        { provide: SocketGateway, useValue: { sendToRoom: jest.fn() } },
        { provide: TransactionsRepository, useValue: transactionsRepository },
        // Settlement collaborators of the real TransactionPaymentProcessor
        { provide: AuditService, useValue: { logAllow: jest.fn(), logError: jest.fn() } },
        { provide: CardsRepository, useValue: cardsRepository },
        { provide: CardVaultAdapter, useValue: { getPinblock: jest.fn().mockResolvedValue(Result.ok('stored-pinblock')) } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: INJECTION_TOKENS.CARD_SGT_PORT, useValue: adapter },
        { provide: TenantsRepository, useValue: { findById: jest.fn().mockResolvedValue({ id: 'tenant-001', code: 'T001' }) } },
        { provide: TenantVaultService, useValue: { getPan: jest.fn().mockResolvedValue(Result.ok('9200000000000001')) } },
        { provide: UsersRepository, useValue: { findByIdRaw: jest.fn().mockResolvedValue({ idNumber: '85010112345' }) } },
      ],
    }).compile();

    service = module.get(NfcAuthorizationService);
  });

  it('approves a valid NFC Authorization and settles it with TR000', async () => {
    const result = await service.authorizePayment(
      {
        intentId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        signedPayload: signedPayloadFor(1500),
        amount: 1500,
        currency: 'USD',
      },
      'oauth-client-1',
    );

    expect(result.approved).toBe(true);
    expect(result.status).toBe(TransactionStatus.SUCCESS);
    expect(result.transferCode).toBe('TR000');
    expect(transactionsRepository.updateStatus).toHaveBeenCalledWith(
      result.txId,
      TransactionStatus.SUCCESS,
      expect.objectContaining({ sgtTransferCode: 'TR000' }),
    );
    // 2500.00 − 15.00
    expect(cardsRepository.update).toHaveBeenCalledWith(CARD_ID, { balance: 2485 });
  });
});
