import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { AuditService } from 'src/modules/audit/application/audit.service';
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
