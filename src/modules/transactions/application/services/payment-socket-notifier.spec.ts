import { Test, TestingModule } from '@nestjs/testing';
import { PaymentSocketNotifier } from './payment-socket-notifier';
import { TransactionsRepository } from '../../infrastructure/adapters/transactions.repository';
import { SocketGateway } from 'src/sockets/sockets.gateway';
import {
  TransactionProcessedEvent,
  TransactionExpiredEvent,
  TransactionCancelledEvent,
} from '../../domain/events/transaction.events';

describe('PaymentSocketNotifier', () => {
  let notifier: PaymentSocketNotifier;
  let socketGateway: { sendToRoom: jest.Mock };
  let transactionsRepository: { findById: jest.Mock };

  beforeEach(async () => {
    socketGateway = { sendToRoom: jest.fn() };
    transactionsRepository = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentSocketNotifier,
        { provide: SocketGateway, useValue: socketGateway },
        { provide: TransactionsRepository, useValue: transactionsRepository },
      ],
    }).compile();

    notifier = module.get<PaymentSocketNotifier>(PaymentSocketNotifier);
  });

  it('should emit payment.result to intentId room on transaction.processed', async () => {
    transactionsRepository.findById.mockResolvedValue({
      id: 'txn-1',
      intentId: 'intent-abc',
    });

    await notifier.handleTransactionProcessed(
      new TransactionProcessedEvent('txn-1', 'tenant-1', 'success'),
    );

    expect(socketGateway.sendToRoom).toHaveBeenCalledWith(
      'intent-abc',
      'payment.result',
      expect.objectContaining({
        transactionId: 'txn-1',
        intentId: 'intent-abc',
        status: 'success',
        error: null,
      }),
    );
  });

  it('should emit payment.result with error on failure', async () => {
    transactionsRepository.findById.mockResolvedValue({
      id: 'txn-2',
      intentId: 'intent-def',
    });

    await notifier.handleTransactionProcessed(
      new TransactionProcessedEvent('txn-2', 'tenant-1', 'failed', 'Saldo insuficiente'),
    );

    expect(socketGateway.sendToRoom).toHaveBeenCalledWith(
      'intent-def',
      'payment.result',
      expect.objectContaining({
        status: 'failed',
        error: 'Saldo insuficiente',
      }),
    );
  });

  it('should not emit if transaction not found', async () => {
    transactionsRepository.findById.mockResolvedValue(null);

    await notifier.handleTransactionProcessed(
      new TransactionProcessedEvent('txn-x', 'tenant-1', 'success'),
    );

    expect(socketGateway.sendToRoom).not.toHaveBeenCalled();
  });

  it('should emit expired status on transaction.expired', async () => {
    transactionsRepository.findById.mockResolvedValue({
      id: 'txn-3',
      intentId: 'intent-ghi',
    });

    await notifier.handleTransactionExpired(
      new TransactionExpiredEvent('txn-3', 'tenant-1'),
    );

    expect(socketGateway.sendToRoom).toHaveBeenCalledWith(
      'intent-ghi',
      'payment.result',
      expect.objectContaining({ status: 'expired' }),
    );
  });

  it('should emit cancelled status on transaction.cancelled', async () => {
    transactionsRepository.findById.mockResolvedValue({
      id: 'txn-4',
      intentId: 'intent-jkl',
    });

    await notifier.handleTransactionCancelled(
      new TransactionCancelledEvent('txn-4', 'tenant-1'),
    );

    expect(socketGateway.sendToRoom).toHaveBeenCalledWith(
      'intent-jkl',
      'payment.result',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });
});
