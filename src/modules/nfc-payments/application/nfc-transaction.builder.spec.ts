/**
 * Unit Tests: NfcTransactionBuilder
 *
 * Pure mapping from authorization context to Transaction + processPayment args.
 * No I/O, no DI — just data shaping.
 */

import { NfcTransactionBuilder } from './nfc-transaction.builder';
import { TokenData } from './nfc-authorization.service';
import { TransactionStatus } from '../../transactions/domain/entities/transaction.entity';
import type { TerminalEntity } from '../../terminals/domain/ports/terminal-repository.port';
import type { NfcEnrollmentEntity } from '../domain/ports/nfc-enrollment-repository.port';
import { TerminalCapability, TerminalStatus } from '../../terminals/domain/constants/terminal.constants';

describe('NfcTransactionBuilder', () => {
  const builder = new NfcTransactionBuilder();

  const tokenData: TokenData = {
    cardId: 'card-001',
    amount: 1500,
    currency: 'USD',
    posId: 'pos-1',
    txRef: 'tx-ref-1',
    nonce: 'aabbccdd',
    counter: 1,
    serverTimestamp: Date.now(),
    sessionId: 'session-uuid-1',
  };

  const enrollment: NfcEnrollmentEntity = {
    id: 'enrollment-id',
    cardId: 'card-001',
    userId: 'user-1',
    devicePublicKey: 'pk',
    serverPublicKey: 'spk',
    vaultKeyPath: 'vault/path',
    counter: 0,
    status: 'active',
  };

  const terminal: TerminalEntity = {
    terminalId: 'term-001',
    tenantId: 'tenant-001',
    name: 'POS',
    type: 'physical_pos',
    capabilities: [TerminalCapability.NFC],
    status: TerminalStatus.ACTIVE,
    oauthClientId: 'oauth-client-1',
    createdBy: 'admin',
  };

  it('builds a Transaction in NEW status with intentId equal to sessionId', () => {
    const { transaction } = builder.build({ tokenData, enrollment, terminal });

    expect(transaction.status).toBe(TransactionStatus.NEW);
    expect(transaction.intentId).toBe(tokenData.sessionId);
  });

  it('maps cardId, amount, customerId from enrollment, tenantId from terminal', () => {
    const { transaction } = builder.build({ tokenData, enrollment, terminal });

    expect(transaction.cardId).toBe(tokenData.cardId);
    expect(transaction.amount).toBe(tokenData.amount);
    expect(transaction.customerId).toBe(enrollment.userId);
    expect(transaction.tenantId).toBe(terminal.tenantId);
  });

  it('produces processPayment args matching the persisted transaction', () => {
    const { transaction, processPaymentArgs } = builder.build({
      tokenData,
      enrollment,
      terminal,
    });

    expect(processPaymentArgs).toEqual([
      transaction.id,
      transaction.tenantId,
      enrollment.userId,
      tokenData.cardId,
      tokenData.amount,
    ]);
  });

  it('falls back to empty tenantId when terminal is null (legacy callers)', () => {
    const { transaction } = builder.build({ tokenData, enrollment, terminal: null });

    expect(transaction.tenantId).toBe('');
  });
});
