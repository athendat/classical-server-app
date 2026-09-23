import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { Result } from 'src/common/types/result.type';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';
import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';
import { TenantVaultService } from 'src/modules/tenants/infrastructure/services/tenant-vault.service';
import { TransactionPaymentProcessor } from 'src/modules/transactions/application/services/transaction-payment.processor';
import { TransactionStatus } from 'src/modules/transactions/domain/entities/transaction.entity';
import { TransactionsRepository } from 'src/modules/transactions/infrastructure/adapters/transactions.repository';

import { CardsService } from '../../application/cards.service';
import { CreateCardDto } from '../../dto/create-card.dto';
import { CardStatusEnum, CardTypeEnum } from '../../domain/enums';
import { CardsRepository } from './card.repository';
import { CardVaultAdapter } from './card-vault.adapter';
import { Iso4PinblockService } from '../services/iso4-pinblock.service';
import { SimulatedSgtCardAdapter } from './simulated-sgt-card.adapter';

/**
 * Issue #60 — SGT_MODE=simulated: the Issuer is simulated behind the
 * CARD_SGT_PORT; everything else runs for real.
 */

const fakeConfig = (values: Record<string, string | undefined> = {}) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

describe('SimulatedSgtCardAdapter — Card activation through CardsService', () => {
  const createCardDto: CreateCardDto = {
    pan: '4242424242424242',
    pin: '1234',
    expiryMonth: 12,
    expiryYear: 26,
    cardType: CardTypeEnum.PERSONAL,
    ticketReference: 'TICKET-123',
    tml: 'TML-1',
    aut: 'AUT-1',
  } as CreateCardDto;

  async function buildCardsService(config: ConfigService) {
    const cardsRepository = {
      findByUserId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async (card) => ({
        ...card,
        createdAt: new Date('2026-09-23T00:00:00.000Z'),
      })),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        {
          provide: AsyncContextService,
          useValue: {
            getRequestId: jest.fn().mockReturnValue('req-1'),
            getActorId: jest.fn().mockReturnValue('user-1'),
          },
        },
        { provide: AuditService, useValue: { logAllow: jest.fn(), logError: jest.fn() } },
        { provide: CardsRepository, useValue: cardsRepository },
        {
          provide: CardVaultAdapter,
          useValue: {
            savePanAndPinblock: jest.fn().mockResolvedValue(Result.ok()),
            deletePanAndPinblock: jest.fn().mockResolvedValue(Result.ok()),
          },
        },
        {
          provide: Iso4PinblockService,
          useValue: {
            convertToIso4Pinblock: jest.fn().mockReturnValue(Result.ok('pinblock')),
          },
        },
        {
          provide: UsersRepository,
          useValue: { findByIdRaw: jest.fn().mockResolvedValue({ idNumber: '85010112345' }) },
        },
        {
          provide: INJECTION_TOKENS.CARD_SGT_PORT,
          useValue: new SimulatedSgtCardAdapter(config),
        },
      ],
    }).compile();

    return { service: module.get(CardsService), cardsRepository };
  }

  it('activates the Card (AP000) with a Card token and the configured initial Balance', async () => {
    const { service, cardsRepository } = await buildCardsService(
      fakeConfig({ SGT_SIMULATED_INITIAL_BALANCE: '250000' }),
    );

    const response = await service.registerCard(createCardDto);

    expect(response.ok).toBe(true);
    const persisted = cardsRepository.create.mock.calls[0][0];
    expect(persisted.status).toBe(CardStatusEnum.ACTIVE);
    expect(typeof persisted.token).toBe('string');
    expect(persisted.token.length).toBeGreaterThan(0);
    // 250000 minor units → 2500.00 major units (ADR-0008)
    expect(persisted.balance).toBe(2500);
  });

  it('answers activation with AP000 and a Card token that is deterministic per Card', async () => {
    const adapter = new SimulatedSgtCardAdapter(fakeConfig());

    const first = await adapter.activatePin('card-A', '4242424242424242', 'pb', '85010112345', 't', 'a');
    const again = await adapter.activatePin('card-A', '4242424242424242', 'pb', '85010112345', 't', 'a');
    const other = await adapter.activatePin('card-B', '4242424242424242', 'pb', '85010112345', 't', 'a');

    expect(first.getValue().data?.activationCode).toBe('AP000');
    expect(first.getValue().data?.token).toBe(again.getValue().data?.token);
    expect(first.getValue().data?.token).not.toBe(other.getValue().data?.token);
  });
});

describe('SimulatedSgtCardAdapter — Settlement through TransactionPaymentProcessor', () => {
  const CARD_ID = 'card-qr-1';

  async function buildProcessor(adapter: SimulatedSgtCardAdapter, cardToken: string) {
    const cardsRepository = {
      findById: jest.fn().mockResolvedValue({
        id: CARD_ID,
        status: CardStatusEnum.ACTIVE,
        token: cardToken,
      }),
      update: jest.fn(),
    };
    const transactionsRepository = {
      updateStatus: jest.fn().mockImplementation(async (id, status, updates) => ({
        id,
        status,
        ...updates,
      })),
    };
    const eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionPaymentProcessor,
        { provide: AuditService, useValue: { logAllow: jest.fn(), logError: jest.fn() } },
        { provide: CardsRepository, useValue: cardsRepository },
        {
          provide: CardVaultAdapter,
          useValue: { getPinblock: jest.fn().mockResolvedValue(Result.ok('stored-pinblock')) },
        },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: INJECTION_TOKENS.CARD_SGT_PORT, useValue: adapter },
        {
          provide: TenantsRepository,
          useValue: { findById: jest.fn().mockResolvedValue({ id: 'tenant-1', code: 'T001' }) },
        },
        {
          provide: TenantVaultService,
          useValue: { getPan: jest.fn().mockResolvedValue(Result.ok('9200000000000001')) },
        },
        { provide: TransactionsRepository, useValue: transactionsRepository },
        {
          provide: UsersRepository,
          useValue: { findByIdRaw: jest.fn().mockResolvedValue({ idNumber: '85010112345' }) },
        },
      ],
    }).compile();

    return {
      processor: module.get(TransactionPaymentProcessor),
      cardsRepository,
      transactionsRepository,
      eventEmitter,
    };
  }

  async function activatedCardToken(adapter: SimulatedSgtCardAdapter): Promise<string> {
    const activation = await adapter.activatePin(CARD_ID, '4242424242424242', 'pb', '85010112345', 't', 'a');
    return activation.getValue().data!.token!;
  }

  it('settles a confirmed QR Transaction with TR000 and lowers the cached Balance by the amount', async () => {
    const adapter = new SimulatedSgtCardAdapter(
      fakeConfig({ SGT_SIMULATED_INITIAL_BALANCE: '250000' }),
    );
    const cardToken = await activatedCardToken(adapter);
    const { processor, cardsRepository, transactionsRepository, eventEmitter } =
      await buildProcessor(adapter, cardToken);

    // Domain amount in major units (ADR-0008): 15.25
    const result = await processor.processPayment('txn-1', 'tenant-1', 'customer-1', CARD_ID, 15.25, 'USD');

    expect(result.success).toBe(true);
    expect(result.status).toBe(TransactionStatus.SUCCESS);
    expect(result.transferCode).toBe('TR000');
    expect(transactionsRepository.updateStatus).toHaveBeenCalledWith(
      'txn-1',
      TransactionStatus.SUCCESS,
      expect.objectContaining({ sgtTransferCode: 'TR000' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'transaction.processed',
      expect.objectContaining({ transactionId: 'txn-1', status: 'success' }),
    );
    // 2500.00 − 15.25
    expect(cardsRepository.update).toHaveBeenCalledWith(CARD_ID, { balance: 2484.75 });
  });

  it('rejects with TR001 when the amount ends in 99 cents, leaving the Transaction failed and the Balance untouched', async () => {
    const adapter = new SimulatedSgtCardAdapter(fakeConfig());
    const cardToken = await activatedCardToken(adapter);
    const { processor, cardsRepository, transactionsRepository, eventEmitter } =
      await buildProcessor(adapter, cardToken);

    const result = await processor.processPayment('txn-99', 'tenant-1', 'customer-1', CARD_ID, 10.99, 'USD');

    expect(result.success).toBe(false);
    expect(result.status).toBe(TransactionStatus.FAILED);
    expect(result.transferCode).toBe('TR001');
    expect(transactionsRepository.updateStatus).toHaveBeenCalledWith(
      'txn-99',
      TransactionStatus.FAILED,
      expect.objectContaining({ sgtTransferCode: 'TR001' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'transaction.processed',
      expect.objectContaining({ transactionId: 'txn-99', status: 'failed' }),
    );
    expect(cardsRepository.update).not.toHaveBeenCalled();
  });

  it('reports the current Balance, not the initial one, when a settled Card is activated again', async () => {
    const adapter = new SimulatedSgtCardAdapter(
      fakeConfig({ SGT_SIMULATED_INITIAL_BALANCE: '250000' }),
    );
    const cardToken = await activatedCardToken(adapter);
    const { processor } = await buildProcessor(adapter, cardToken);
    await processor.processPayment('txn-1', 'tenant-1', 'customer-1', CARD_ID, 15.25, 'USD');

    const retry = await adapter.activatePin(CARD_ID, '4242424242424242', 'pb', '85010112345', 't', 'a', cardToken);

    // 2500.00 − 15.25 = 2484.75 → 248475 minor units
    expect(retry.getValue().data?.balance).toBe('000000248475');
  });

  it('rejects with TR001 (insufficient funds) an amount above the Balance, leaving the Balance untouched', async () => {
    const adapter = new SimulatedSgtCardAdapter(
      fakeConfig({ SGT_SIMULATED_INITIAL_BALANCE: '10000' }),
    );
    const cardToken = await activatedCardToken(adapter);
    const { processor, cardsRepository, transactionsRepository } = await buildProcessor(adapter, cardToken);

    // Balance 100.00; 150.00 exceeds it
    const rejected = await processor.processPayment('txn-over', 'tenant-1', 'customer-1', CARD_ID, 150, 'USD');

    expect(rejected.status).toBe(TransactionStatus.FAILED);
    expect(rejected.transferCode).toBe('TR001');
    expect(transactionsRepository.updateStatus).toHaveBeenCalledWith(
      'txn-over',
      TransactionStatus.FAILED,
      expect.objectContaining({ sgtTransferCode: 'TR001' }),
    );
    expect(cardsRepository.update).not.toHaveBeenCalled();

    // The whole Balance can still be spent: it ends at exactly 0, never negative
    const exact = await processor.processPayment('txn-all', 'tenant-1', 'customer-1', CARD_ID, 100, 'USD');

    expect(exact.status).toBe(TransactionStatus.SUCCESS);
    expect(cardsRepository.update).toHaveBeenCalledWith(CARD_ID, { balance: 0 });
  });

  it('credits the Balance on a refund', async () => {
    const adapter = new SimulatedSgtCardAdapter(
      fakeConfig({ SGT_SIMULATED_INITIAL_BALANCE: '10000' }),
    );

    const result = await adapter.transfer({
      token: 'SIM-CARD-TOKEN',
      pin: 'pb',
      amount: '000000002500',
      settlementAmount: '000000002438',
      cardholderAmount: '000000000062',
      beneficiaryAccount: '9200000000000001',
      clientReference: 'TXN-refund',
      type: 'refund',
      merchantId: '00000000000T001',
      idNumber: '85010112345',
    });

    // 100.00 + 25.00
    expect(result.getValue().data?.transferCode).toBe('TR000');
    expect(result.getValue().data?.balance).toBe('000000012500');
  });

  it('answers insufficient funds without any Balance on the wire', async () => {
    const adapter = new SimulatedSgtCardAdapter(
      fakeConfig({ SGT_SIMULATED_INITIAL_BALANCE: '10000' }),
    );

    const result = await adapter.transfer({
      token: 'SIM-CARD-TOKEN',
      pin: 'pb',
      amount: '000000015000',
      settlementAmount: '000000014625',
      cardholderAmount: '000000000375',
      beneficiaryAccount: '9200000000000001',
      clientReference: 'TXN-over',
      type: 'payment',
      merchantId: '00000000000T001',
      idNumber: '85010112345',
    });

    const response = result.getValue();
    expect(response.ok).toBe(false);
    expect(response.data?.transferCode).toBe('TR001');
    expect(response.message).toMatch(/insuficientes/i);
    expect(response.data?.balance).toBeUndefined();
  });

  it('keeps lowering the Balance across consecutive Settlements of the same Card', async () => {
    const adapter = new SimulatedSgtCardAdapter(
      fakeConfig({ SGT_SIMULATED_INITIAL_BALANCE: '250000' }),
    );
    const cardToken = await activatedCardToken(adapter);
    const { processor, cardsRepository } = await buildProcessor(adapter, cardToken);

    await processor.processPayment('txn-1', 'tenant-1', 'customer-1', CARD_ID, 100, 'USD');
    await processor.processPayment('txn-2', 'tenant-1', 'customer-1', CARD_ID, 50.5, 'USD');

    expect(cardsRepository.update).toHaveBeenLastCalledWith(CARD_ID, { balance: 2349.5 });
  });
});
