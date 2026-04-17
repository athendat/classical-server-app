import { Injectable } from '@nestjs/common';

import { TokenData } from './nfc-authorization.service';
import { Transaction, TransactionStatus } from '../../transactions/domain/entities/transaction.entity';
import type { TerminalEntity } from '../../terminals/domain/ports/terminal-repository.port';
import type { NfcEnrollmentEntity } from '../domain/ports/nfc-enrollment-repository.port';

export interface NfcTransactionBuildInput {
  tokenData: TokenData;
  enrollment: NfcEnrollmentEntity;
  terminal: TerminalEntity | null;
}

export type ProcessPaymentArgs = [
  transactionId: string,
  tenantId: string,
  customerId: string,
  cardId: string,
  amount: number,
];

export interface NfcTransactionBuildResult {
  transaction: Transaction;
  processPaymentArgs: ProcessPaymentArgs;
}

@Injectable()
export class NfcTransactionBuilder {
  build(input: NfcTransactionBuildInput): NfcTransactionBuildResult {
    const { tokenData, enrollment, terminal } = input;

    const transaction = new Transaction({
      tenantId: terminal?.tenantId ?? '',
      customerId: enrollment.userId,
      cardId: tokenData.cardId,
      amount: tokenData.amount,
      intentId: tokenData.sessionId,
      status: TransactionStatus.NEW,
    });

    const processPaymentArgs: ProcessPaymentArgs = [
      transaction.id,
      transaction.tenantId,
      enrollment.userId,
      tokenData.cardId,
      tokenData.amount,
    ];

    return { transaction, processPaymentArgs };
  }
}
