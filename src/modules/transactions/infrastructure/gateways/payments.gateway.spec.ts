// src/modules/transactions/infrastructure/gateways/payments.gateway.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsGateway } from './payments.gateway';
import { TransactionsRepository } from 'src/modules/transactions/infrastructure/adapters/transactions.repository';
import { Result } from 'src/common/types/result.type';
import { TransactionProcessedEvent, TransactionExpiredEvent, TransactionCancelledEvent } from 'src/modules/transactions/domain/events/transaction.events';

describe('PaymentsGateway', () => {
  let gateway: PaymentsGateway;
  let jwtTokenPort: { verify: jest.Mock };
  let transactionsRepository: { findById: jest.Mock };
  let mockRoom: { emit: jest.Mock };
  let mockServer: { to: jest.Mock };

  beforeEach(async () => {
    jwtTokenPort = { verify: jest.fn() };
    transactionsRepository = { findById: jest.fn() };
    mockRoom = { emit: jest.fn() };
    mockServer = { to: jest.fn().mockReturnValue(mockRoom) } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsGateway,
        { provide: 'IJwtTokenPort', useValue: jwtTokenPort },
        { provide: TransactionsRepository, useValue: transactionsRepository },
      ],
    }).compile();

    gateway = module.get<PaymentsGateway>(PaymentsGateway);
    gateway.server = mockServer as any;
  });

  describe('handleConnection', () => {
    it('should disconnect if no token is present', async () => {
      const client = {
        id: 'c1',
        handshake: { auth: {}, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith('connected', expect.anything());
    });

    it('should disconnect if token verification fails', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.fail(new Error('invalid token')));

      const client = {
        id: 'c1',
        handshake: { auth: { token: 'bad-token' }, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith('connected', expect.anything());
    });

    it('should accept connection and emit connected when token is valid', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.ok({ sub: 'pos-terminal-1' }));

      const client = {
        id: 'c1',
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('connected', {
        message: 'Connected to payments gateway',
        clientId: 'c1',
      });
    });

    it('should accept token from Authorization header', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.ok({ sub: 'pos-terminal-2' }));

      const client = {
        id: 'c2',
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
        },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(jwtTokenPort.verify).toHaveBeenCalledWith('header-token');
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleJoin', () => {
    it('should join the room named after the intentId and confirm', () => {
      const client = { join: jest.fn(), emit: jest.fn() } as any;

      gateway.handleJoin(client, { intentId: 'intent-uuid-123' });

      expect(client.join).toHaveBeenCalledWith('intent-uuid-123');
      expect(client.emit).toHaveBeenCalledWith('joined', { intentId: 'intent-uuid-123' });
    });

    it('should emit error and not join if intentId is empty', () => {
      const client = { join: jest.fn(), emit: jest.fn() } as any;

      gateway.handleJoin(client, { intentId: '   ' });

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'intentId is required' });
    });
  });

  describe('handleTransactionProcessed', () => {
    it('should emit payment.result to the intentId room on success', async () => {
      transactionsRepository.findById.mockResolvedValue({
        id: 'txn-1',
        intentId: 'intent-abc',
      });

      await gateway.handleTransactionProcessed(
        new TransactionProcessedEvent('txn-1', 'tenant-1', 'success'),
      );

      expect(mockServer.to).toHaveBeenCalledWith('intent-abc');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        'payment.result',
        expect.objectContaining({
          transactionId: 'txn-1',
          intentId: 'intent-abc',
          status: 'success',
        }),
      );
    });

    it('should emit payment.result with error on failure', async () => {
      transactionsRepository.findById.mockResolvedValue({
        id: 'txn-2',
        intentId: 'intent-def',
      });

      await gateway.handleTransactionProcessed(
        new TransactionProcessedEvent('txn-2', 'tenant-1', 'failed', 'Saldo insuficiente'),
      );

      expect(mockServer.to).toHaveBeenCalledWith('intent-def');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        'payment.result',
        expect.objectContaining({
          status: 'failed',
          error: 'Saldo insuficiente',
        }),
      );
    });

    it('should do nothing if transaction is not found', async () => {
      transactionsRepository.findById.mockResolvedValue(null);

      await gateway.handleTransactionProcessed(
        new TransactionProcessedEvent('txn-x', 'tenant-1', 'success'),
      );

      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('handleTransactionExpired', () => {
    it('should emit payment.result with status expired to the intentId room', async () => {
      transactionsRepository.findById.mockResolvedValue({
        id: 'txn-3',
        intentId: 'intent-ghi',
      });

      await gateway.handleTransactionExpired(
        new TransactionExpiredEvent('txn-3', 'tenant-1'),
      );

      expect(mockServer.to).toHaveBeenCalledWith('intent-ghi');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        'payment.result',
        expect.objectContaining({ status: 'expired' }),
      );
    });

    it('should do nothing if transaction is not found', async () => {
      transactionsRepository.findById.mockResolvedValue(null);

      await gateway.handleTransactionExpired(
        new TransactionExpiredEvent('txn-y', 'tenant-1'),
      );

      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('handleTransactionCancelled', () => {
    it('should emit payment.result with status cancelled to the intentId room', async () => {
      transactionsRepository.findById.mockResolvedValue({
        id: 'txn-4',
        intentId: 'intent-jkl',
      });

      await gateway.handleTransactionCancelled(
        new TransactionCancelledEvent('txn-4', 'tenant-1'),
      );

      expect(mockServer.to).toHaveBeenCalledWith('intent-jkl');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        'payment.result',
        expect.objectContaining({ status: 'cancelled' }),
      );
    });

    it('should do nothing if transaction is not found', async () => {
      transactionsRepository.findById.mockResolvedValue(null);

      await gateway.handleTransactionCancelled(
        new TransactionCancelledEvent('txn-z', 'tenant-1'),
      );

      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });
});
