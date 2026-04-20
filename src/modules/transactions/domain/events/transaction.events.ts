import { BaseDomainEvent } from "src/common/events/base-domain.event";

export class TransactionCreatedEvent extends BaseDomainEvent {
  constructor(
    readonly transactionId: string,
    readonly tenantId: string,
    readonly customerId: string,
    readonly ref: string,
    readonly no: number,
    readonly amount: number,
    readonly expiresAt: Date,
  ) {
    super('transaction.created');
  }
}

export class TransactionConfirmedEvent extends BaseDomainEvent {
  constructor(
    readonly transactionId: string,
    readonly tenantId: string,
    readonly customerId: string,
    readonly cardId: string,
  ) {
    super('transaction.confirmed');
  }
}

export class TransactionProcessedEvent extends BaseDomainEvent {
  constructor(
    readonly transactionId: string,
    readonly tenantId: string,
    readonly status: 'success' | 'failed',
    readonly error?: string,
    readonly amount?: number,
    readonly currency?: string,
  ) {
    super('transaction.processed');
  }
}

export class TransactionExpiredEvent extends BaseDomainEvent {
  constructor(
    readonly transactionId: string,
    readonly tenantId: string,
  ) {
    super('transaction.expired');
  }
}

export class TransactionCancelledEvent extends BaseDomainEvent {
  constructor(
    readonly transactionId: string,
    readonly tenantId: string,
  ) {
    super('transaction.cancelled');
  }
}
