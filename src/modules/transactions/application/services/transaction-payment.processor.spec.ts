import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { Result } from 'src/common/types/result.type';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { CardStatusEnum } from 'src/modules/cards/domain/enums/card-status.enum';
import { CardsRepository } from 'src/modules/cards/infrastructure/adapters/card.repository';
import { CardVaultAdapter } from 'src/modules/cards/infrastructure/adapters/card-vault.adapter';
import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';
import { TenantVaultService } from 'src/modules/tenants/infrastructure/services/tenant-vault.service';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';
import { TransactionStatus } from '../../domain/entities/transaction.entity';
import { TransactionsRepository } from '../../infrastructure/adapters/transactions.repository';
import { TransactionPaymentProcessor } from './transaction-payment.processor';

describe('TransactionPaymentProcessor', () => {
  let processor: TransactionPaymentProcessor;
  let cardsRepository: { findById: jest.Mock; update: jest.Mock };
  let transactionsRepository: { updateStatus: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let auditService: { logError: jest.Mock; logAllow: jest.Mock };

  beforeEach(async () => {
    cardsRepository = {
      findById: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    transactionsRepository = {
      updateStatus: jest.fn().mockResolvedValue({
        id: 'txn-1',
        status: TransactionStatus.FAILED,
      }),
    };
    eventEmitter = { emit: jest.fn() };
    auditService = {
      logError: jest.fn(),
      logAllow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionPaymentProcessor,
        { provide: AuditService, useValue: auditService },
        { provide: CardsRepository, useValue: cardsRepository },
        { provide: CardVaultAdapter, useValue: { getPinblock: jest.fn() } },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: INJECTION_TOKENS.CARD_SGT_PORT, useValue: { transfer: jest.fn() } },
        { provide: TenantsRepository, useValue: { findById: jest.fn() } },
        { provide: TenantVaultService, useValue: { getPan: jest.fn() } },
        { provide: TransactionsRepository, useValue: transactionsRepository },
        { provide: UsersRepository, useValue: { findByIdRaw: jest.fn() } },
      ],
    }).compile();

    processor = module.get<TransactionPaymentProcessor>(TransactionPaymentProcessor);
  });

  it('preserves amount and currency on card-not-found failures', async () => {
    const result = await processor.processPayment(
      'txn-1',
      'tenant-1',
      'customer-1',
      'card-404',
      15,
      'USD',
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        status: TransactionStatus.FAILED,
        error: 'Tarjeta no encontrada',
      }),
    );
    expect(transactionsRepository.updateStatus).toHaveBeenCalledWith(
      'txn-1',
      TransactionStatus.FAILED,
      expect.objectContaining({
        processedAt: expect.any(Date),
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'transaction.processed',
      expect.objectContaining({
        transactionId: 'txn-1',
        tenantId: 'tenant-1',
        status: 'failed',
        error: 'Tarjeta no encontrada',
        amount: 15,
        currency: 'USD',
      }),
    );
    expect(auditService.logError).toHaveBeenCalled();
  });
});

describe('TransactionPaymentProcessor — Issuer rejection at Settlement', () => {
  let processor: TransactionPaymentProcessor;
  let sgtCardPort: { transfer: jest.Mock };
  let transactionsRepository: { updateStatus: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    sgtCardPort = { transfer: jest.fn() };
    transactionsRepository = {
      updateStatus: jest.fn().mockResolvedValue({ id: 'txn-1', status: TransactionStatus.FAILED }),
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionPaymentProcessor,
        { provide: AuditService, useValue: { logError: jest.fn(), logAllow: jest.fn() } },
        {
          provide: CardsRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: 'card-1',
              status: CardStatusEnum.ACTIVE,
              token: 'CARDTOKEN0001',
            }),
            update: jest.fn(),
          },
        },
        {
          provide: CardVaultAdapter,
          useValue: { getPinblock: jest.fn().mockResolvedValue(Result.ok('stored-pinblock')) },
        },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: INJECTION_TOKENS.CARD_SGT_PORT, useValue: sgtCardPort },
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

    processor = module.get<TransactionPaymentProcessor>(TransactionPaymentProcessor);
  });

  it("records the Issuer's transfer code and ISO code and reports the transfer code's message, not SGT's raw text", async () => {
    sgtCardPort.transfer.mockResolvedValue(
      Result.ok({
        ok: false,
        message: 'Fondos insuficientes',
        data: { transferCode: 'TR001', isoResponseCode: '51' },
      }),
    );

    const result = await processor.processPayment('txn-1', 'tenant-1', 'customer-1', 'card-1', 15, 'USD');

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        status: TransactionStatus.FAILED,
        transferCode: 'TR001',
        isoResponseCode: '51',
        error: 'Transferencia rechazada',
      }),
    );
    expect(transactionsRepository.updateStatus).toHaveBeenCalledWith(
      'txn-1',
      TransactionStatus.FAILED,
      expect.objectContaining({
        processedAt: expect.any(Date),
        sgtTransferCode: 'TR001',
        sgtIsoResponseCode: '51',
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'transaction.processed',
      expect.objectContaining({ transactionId: 'txn-1', status: 'failed', error: 'Transferencia rechazada' }),
    );
  });
});
