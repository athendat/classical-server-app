import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

import { TokenData } from './nfc-authorization.service';
import { Transaction, TransactionStatus } from '../../transactions/domain/entities/transaction.entity';
import type { TerminalEntity } from '../../terminals/domain/ports/terminal-repository.port';
import type { NfcEnrollmentEntity } from '../domain/ports/nfc-enrollment-repository.port';

export interface NfcTransactionBuildInput {
  tokenData: TokenData;
  enrollment: NfcEnrollmentEntity;
  terminal: TerminalEntity;
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
  private static lastTransactionNo = 0;
  private static readonly TRANSACTION_TTL_MINUTES = 15;

  private nextTransactionNo(): number {
    const now = Date.now();
    NfcTransactionBuilder.lastTransactionNo = Math.max(
      now,
      NfcTransactionBuilder.lastTransactionNo + 1,
    );

    return NfcTransactionBuilder.lastTransactionNo;
  }

  private buildExpiresAt(ttlMinutes: number): Date {
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  build(input: NfcTransactionBuildInput): NfcTransactionBuildResult {
    const { tokenData, enrollment, terminal } = input;
    if (!terminal?.tenantId) {
      throw new Error('Cannot build NFC transaction without a tenantId');
    }

    const ttlMinutes = NfcTransactionBuilder.TRANSACTION_TTL_MINUTES;
    const signature = createHash('sha256')
      .update(`${tokenData.sessionId}:${tokenData.txRef}:${tokenData.amount}`)
      .digest('hex');

    const transaction = new Transaction({
      no: this.nextTransactionNo(),
      ref: tokenData.txRef || `nfc-${tokenData.sessionId}`,
      tenantId: terminal.tenantId,
      tenantName: terminal.name || terminal.tenantId,
      customerId: enrollment.userId,
      cardId: tokenData.cardId,
      amount: tokenData.amount,
      intentId: tokenData.sessionId,
      ttlMinutes,
      expiresAt: this.buildExpiresAt(ttlMinutes),
      signature,
      status: TransactionStatus.NEW,
    });

    const processPaymentArgs: ProcessPaymentArgs = [
      transaction.id,
      transaction.tenantId,
      enrollment.userId,
      tokenData.cardId,
      tokenData.amount * 0.01,
    ];

    return { transaction, processPaymentArgs };
  }
}
