import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { SocketGateway } from 'src/sockets/sockets.gateway';
import { TransactionsRepository } from '../../infrastructure/adapters/transactions.repository';
import {
  TransactionProcessedEvent,
  TransactionExpiredEvent,
  TransactionCancelledEvent,
} from '../../domain/events/transaction.events';

@Injectable()
export class PaymentSocketNotifier {
  private readonly logger = new Logger(PaymentSocketNotifier.name);

  constructor(
    private readonly socketGateway: SocketGateway,
    private readonly transactionsRepository: TransactionsRepository,
  ) {}

  @OnEvent('transaction.processed')
  async handleTransactionProcessed(event: TransactionProcessedEvent): Promise<void> {
    await this.emitPaymentResult(
      event.transactionId,
      event.status,
      event.error ?? null,
      event.amount,
      event.currency,
    );
  }

  @OnEvent('transaction.expired')
  async handleTransactionExpired(event: TransactionExpiredEvent): Promise<void> {
    await this.emitPaymentResult(event.transactionId, 'expired');
  }

  @OnEvent('transaction.cancelled')
  async handleTransactionCancelled(event: TransactionCancelledEvent): Promise<void> {
    await this.emitPaymentResult(event.transactionId, 'cancelled');
  }

  private async emitPaymentResult(
    transactionId: string,
    status: string,
    error: string | null = null,
    amount?: number,
    currency?: string,
  ): Promise<void> {
    const transaction = await this.transactionsRepository.findById(transactionId);
    if (!transaction) {
      this.logger.warn(`Transaction ${transactionId} not found for socket notification`);
      return;
    }

    this.socketGateway.sendToRoom(transaction.intentId, 'payment.result', {
      transactionId,
      intentId: transaction.intentId,
      status,
      error,
      amount: amount ?? transaction.amount,
      currency,
      timestamp: new Date().toISOString(),
    });
  }
}
