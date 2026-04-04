// src/modules/transactions/infrastructure/gateways/payments.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';

import type { IJwtTokenPort } from 'src/modules/auth/domain/ports/jwt-token.port';
import { TransactionsRepository } from 'src/modules/transactions/infrastructure/adapters/transactions.repository';
import {
  TransactionProcessedEvent,
  TransactionExpiredEvent,
  TransactionCancelledEvent,
} from 'src/modules/transactions/domain/events/transaction.events';

@WebSocketGateway({
  namespace: 'payments',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class PaymentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PaymentsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject('IJwtTokenPort')
    private readonly jwtTokenPort: IJwtTokenPort,
    private readonly transactionsRepository: TransactionsRepository,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const auth = client.handshake.auth as { token?: unknown };
      const tokenFromAuth = typeof auth.token === 'string' ? auth.token : undefined;
      const authHeader = client.handshake.headers.authorization;
      const tokenFromHeader =
        typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;

      const token = tokenFromAuth ?? tokenFromHeader;

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token — disconnecting`);
        client.disconnect();
        return;
      }

      const verifyResult = await this.jwtTokenPort.verify(token);
      if (verifyResult.isFailure) {
        this.logger.warn(
          `Client ${client.id} provided invalid token: ${verifyResult.getError().message}`,
        );
        client.disconnect();
        return;
      }

      const payload = verifyResult.getValue();
      this.logger.log(`Client ${client.id} connected (sub: ${payload.sub})`);

      client.emit('connected', {
        message: 'Connected to payments gateway',
        clientId: client.id,
      });
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling connection for ${client.id}: ${errorMsg}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, data: { intentId: string }): void {
    const { intentId } = data;
    if (!intentId || typeof intentId !== 'string' || intentId.trim().length === 0) {
      client.emit('error', { message: 'intentId is required' });
      return;
    }
    client.join(intentId);
    client.emit('joined', { intentId });
    this.logger.log(`Client ${client.id} joined room ${intentId}`);
  }

  @OnEvent('transaction.processed')
  async handleTransactionProcessed(event: TransactionProcessedEvent): Promise<void> {
    await this.emitPaymentResult('transaction.processed', event.transactionId, event.status, event.error ?? null);
  }

  @OnEvent('transaction.expired')
  async handleTransactionExpired(event: TransactionExpiredEvent): Promise<void> {
    await this.emitPaymentResult('transaction.expired', event.transactionId, 'expired');
  }

  @OnEvent('transaction.cancelled')
  async handleTransactionCancelled(event: TransactionCancelledEvent): Promise<void> {
    await this.emitPaymentResult('transaction.cancelled', event.transactionId, 'cancelled');
  }

  private async emitPaymentResult(
    eventName: string,
    transactionId: string,
    status: string,
    error: string | null = null,
  ): Promise<void> {
    const transaction = await this.transactionsRepository.findById(transactionId);
    if (!transaction) {
      this.logger.warn(`${eventName}: transaction ${transactionId} not found`);
      return;
    }
    this.server.to(transaction.intentId).emit('payment.result', {
      transactionId,
      intentId: transaction.intentId,
      status,
      error,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Emitted payment.result (${status}) to room ${transaction.intentId}`);
  }
}
