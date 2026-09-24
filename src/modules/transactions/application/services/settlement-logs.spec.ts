import { HttpService as AxiosHttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { HttpService } from 'src/common/http/http.service';
import { captureLogs, findLeakedSecrets, LogCapture } from 'src/common/testing/log-capture';
import { Result } from 'src/common/types/result.type';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { CardStatusEnum } from 'src/modules/cards/domain/enums/card-status.enum';
import { CardsRepository } from 'src/modules/cards/infrastructure/adapters/card.repository';
import { CardVaultAdapter } from 'src/modules/cards/infrastructure/adapters/card-vault.adapter';
import { SgtCardAdapter } from 'src/modules/cards/infrastructure/adapters/sgt-card.adapter';
import { SgtPinblockAdapter } from 'src/modules/cards/infrastructure/adapters/sgt-pinblock.adapter';
import { Iso4PinblockService } from 'src/modules/cards/infrastructure/services/iso4-pinblock.service';
import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';
import { TenantVaultService } from 'src/modules/tenants/infrastructure/services/tenant-vault.service';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';
import type { IVaultClient } from 'src/modules/vault/domain/ports/vault-client.port';

import { TransactionStatus } from '../../domain/entities/transaction.entity';
import { TransactionsRepository } from '../../infrastructure/adapters/transactions.repository';
import { TransactionPaymentProcessor } from './transaction-payment.processor';

const PIN = '1234';
const CARD_PAN = '4539578763621486';
const CARD_TOKEN = '0400000000701851';
/**
 * Stored PIN block the Settlement reads from Vault. The SGT adapter decodes it with the
 * Card token, so it is built from PIN 1234 and the token: 041234FFFFFFFFFF XOR 0000000000701851.
 */
const STORED_PINBLOCK = '041234FFFF8FE7AE';
const SGT_PLAIN_PINBLOCK = '000431323334FF000000000000000000';
const PIN_ASCII_HEX = '31323334';
const TENANT_PAN = '9200123456780001';
const ID_NUMBER = '85010112345';
const SGT_AES_KEY = '00112233445566778899aabbccddeeff';
const SGT_AES_IV = 'aabbccddeeff00112233445566778899';
const SGT_HMAC_SECRET = 'sgt-hmac-secret-value';
const SGT_API_KEY = 'sgt-api-key-value';

const SGT_CONFIG: Record<string, string> = {
  SGT_URL: 'https://sgt.test',
  SGT_HMAC_SECRET,
  SGT_CLIENT_ID: 'client-id',
  SGT_API_KEY,
  SGT_AES_KEY,
  SGT_AES_IV,
};

/** The QR and the NFC Settlement share this processor (ADR-0003), so this covers both */
describe('Settlement writes no Card or Tenant secret to the logs', () => {
  let processor: TransactionPaymentProcessor;
  let axios: { post: jest.Mock };
  let auditService: { logAllow: jest.Mock; logError: jest.Mock };
  let logs: LogCapture;

  beforeEach(async () => {
    axios = { post: jest.fn() };
    auditService = { logAllow: jest.fn(), logError: jest.fn() };

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key in SGT_CONFIG) return SGT_CONFIG[key];
        throw new Error(`Unknown key: ${key}`);
      }),
    } as unknown as ConfigService;
    const vaultClient = {
      readKV: jest.fn().mockResolvedValue(
        Result.ok({ data: { data: { pan: CARD_PAN, pinblock: STORED_PINBLOCK } } }),
      ),
    } as unknown as IVaultClient;
    const sgtCardAdapter = new SgtCardAdapter(
      new HttpService(axios as unknown as AxiosHttpService),
      configService,
      new SgtPinblockAdapter(configService),
      new Iso4PinblockService(),
    );

    const module = await Test.createTestingModule({
      providers: [
        TransactionPaymentProcessor,
        { provide: AuditService, useValue: auditService },
        {
          provide: CardsRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: 'card-1',
              status: CardStatusEnum.ACTIVE,
              token: CARD_TOKEN,
              lastFour: '1486',
            }),
            update: jest.fn(),
          },
        },
        { provide: CardVaultAdapter, useValue: new CardVaultAdapter(vaultClient) },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: INJECTION_TOKENS.CARD_SGT_PORT, useValue: sgtCardAdapter },
        {
          provide: TenantsRepository,
          useValue: { findById: jest.fn().mockResolvedValue({ id: 'tenant-1', code: 'T001' }) },
        },
        {
          provide: TenantVaultService,
          useValue: { getPan: jest.fn().mockResolvedValue(Result.ok(TENANT_PAN)) },
        },
        {
          provide: TransactionsRepository,
          useValue: {
            updateStatus: jest.fn().mockResolvedValue({ id: 'txn-1', status: TransactionStatus.SUCCESS }),
          },
        },
        {
          provide: UsersRepository,
          useValue: { findByIdRaw: jest.fn().mockResolvedValue({ idNumber: ID_NUMBER }) },
        },
      ],
    }).compile();

    processor = module.get(TransactionPaymentProcessor);
    // After compile(): the testing module overrides the Nest logger on compile
    logs = captureLogs();
  });

  afterEach(() => {
    logs.restore();
  });

  const secretsSentTo = (sgtBody: Record<string, string>): Record<string, string> => ({
    'Stored PIN block': STORED_PINBLOCK,
    PIN,
    'PIN in ASCII-hex': PIN_ASCII_HEX,
    'SGT PIN block in the clear': SGT_PLAIN_PINBLOCK,
    'SGT encrypted PIN block': sgtBody.pin,
    'Card PAN': CARD_PAN,
    'Tenant PAN': TENANT_PAN,
    'Card token': CARD_TOKEN,
    idNumber: ID_NUMBER,
    SGT_AES_KEY,
    SGT_AES_IV,
    SGT_HMAC_SECRET,
    SGT_API_KEY,
  });

  it('a Settlement the Issuer approves logs neither the Stored PIN block, the PIN, the Tenant PAN, the full Card token nor the idNumber', async () => {
    axios.post.mockReturnValue(
      of({
        data: {
          ok: true,
          message: 'Transferencia exitosa',
          data: { transferCode: 'TR000', isoResponseCode: '00', balance: '5000' },
        },
      }),
    );

    const result = await processor.processPayment('txn-1', 'tenant-1', 'customer-1', 'card-1', 15, 'USD');

    expect(result.success).toBe(true);
    const sgtBody = axios.post.mock.calls[0][1];
    expect(sgtBody).toEqual(
      expect.objectContaining({ token: CARD_TOKEN, beneficiaryAccount: TENANT_PAN, idNumber: ID_NUMBER }),
    );
    expect(sgtBody.pin).toMatch(/^[0-9A-F]{32}$/);

    const logText = logs.text(auditService.logAllow.mock.calls, auditService.logError.mock.calls);
    expect(findLeakedSecrets(logText, secretsSentTo(sgtBody))).toEqual([]);
  });
});
