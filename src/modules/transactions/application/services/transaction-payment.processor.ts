import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { AuditService } from 'src/modules/audit/application/audit.service';

import { CardsRepository } from 'src/modules/cards/infrastructure/adapters/card.repository';
import { CardVaultAdapter } from 'src/modules/cards/infrastructure/adapters/card-vault.adapter';
import type { ISgtCardPort } from 'src/modules/cards/domain/ports/sgt-card.port';
import { TRANSFER_CODES } from 'src/modules/cards/domain/constants/transfer-codes.constant';
import { CardStatusEnum } from 'src/modules/cards/domain/enums/card-status.enum';

import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';
import { TenantVaultService } from 'src/modules/tenants/infrastructure/services/tenant-vault.service';

import { UsersRepository } from 'src/modules/users/infrastructure/adapters';

import { TransactionsRepository } from '../../infrastructure/adapters/transactions.repository';
import { TransactionProcessedEvent } from '../../domain/events/transaction.events';
import { Transaction, TransactionStatus } from '../../domain/entities/transaction.entity';

export interface PaymentResult {
  success: boolean;
  status: TransactionStatus;
  transferCode?: string;
  isoResponseCode?: string;
  error?: string;
  updatedTransaction: Transaction | null;
}

/**
 * Procesador síncrono de pagos.
 * Llamado directamente desde TransactionService.confirm() — NO es event-driven.
 *
 * Flujo:
 * 1. Validar tarjeta (activa + token)
 * 2. Recuperar pinblock de Vault
 * 3. Obtener idNumber del usuario
 * 4. Obtener PAN del tenant (cuenta beneficiaria) desde Vault
 * 5. Calcular comisión (2.5%) y formatear montos
 * 6. Llamar SGT /transfer
 * 7. Actualizar transacción a SUCCESS o FAILED según respuesta
 * 8. Emitir evento transaction.processed
 */
@Injectable()
export class TransactionPaymentProcessor {
  private readonly logger = new Logger(TransactionPaymentProcessor.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly cardsRepository: CardsRepository,
    private readonly cardVaultAdapter: CardVaultAdapter,
    private readonly eventEmitter: EventEmitter2,
    @Inject(INJECTION_TOKENS.CARD_SGT_PORT)
    private readonly sgtCardPort: ISgtCardPort,
    private readonly tenantsRepository: TenantsRepository,
    private readonly tenantVaultService: TenantVaultService,
    private readonly transactionsRepository: TransactionsRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * Procesa el pago de una transacción contra el SGT.
   * Retorna el resultado para que confirm() lo use en su respuesta HTTP.
   */
  async processPayment(
    transactionId: string,
    tenantId: string,
    customerId: string,
    cardId: string,
    amount: number,
  ): Promise<PaymentResult> {
    this.logger.log(
      `Procesando pago para transacción=${transactionId}, card=${cardId}, tenant=${tenantId}`,
    );

    try {
      // Step 1: Obtener la tarjeta y validar que esté activa
      const card = await this.cardsRepository.findById(cardId);
      this.logger.log(`Tarjeta encontrada: ${cardId}`);
      if (!card) {
        return this.failAndReturn(transactionId, tenantId, customerId, 'Tarjeta no encontrada');
      }

      if (card.status !== CardStatusEnum.ACTIVE) {
        return this.failAndReturn(transactionId, tenantId, customerId, `Tarjeta no activa: ${card.status}`);
      }

      if (!card.token) {
        return this.failAndReturn(transactionId, tenantId, customerId, 'Tarjeta sin token SGT');
      }

      // Step 2: Obtener pinblock de la tarjeta desde Vault
      const pinblockResult = await this.cardVaultAdapter.getPinblock(cardId);
      this.logger.log(`Pinblock obtenido para tarjeta: ${cardId}`);
      if (pinblockResult.isFailure) {
        return this.failAndReturn(transactionId, tenantId, customerId, 'Error al recuperar pinblock de Vault');
      }

      // Step 3: Obtener datos del usuario (idNumber)
      const user = await this.usersRepository.findByIdRaw(customerId);
      this.logger.log(`Usuario encontrado: ${customerId}`);
      if (!user) {
        return this.failAndReturn(transactionId, tenantId, customerId, 'Usuario no encontrado');
      }

      // Step 4: Obtener datos del tenant y su PAN (cuenta beneficiaria)
      const tenant = await this.tenantsRepository.findById(tenantId);
      this.logger.log(`Tenant encontrado: ${tenantId}`);
      if (!tenant) {
        return this.failAndReturn(transactionId, tenantId, customerId, 'Tenant no encontrado');
      }

      const tenantPanResult = await this.tenantVaultService.getPan(tenantId);
      this.logger.log(`PAN del tenant obtenido: ${tenantId}`);
      if (tenantPanResult.isFailure) {
        return this.failAndReturn(transactionId, tenantId, customerId, 'Error al recuperar PAN del tenant');
      }

      const beneficiaryAccount = tenantPanResult.getValue();
      this.logger.log(`Cuenta beneficiaria del tenant obtenida: ${beneficiaryAccount}`);

      // Step 5: Formatear datos para SGT
      // amount viene en dólares (mapToDomain hace * 0.01)
      // SGT espera 12 dígitos donde los últimos 2 son decimales (centavos)
      const amountCents = Math.round(amount * 100);

      // cardholderAmount = 2.5% del amount (comisión de la pasarela, en centavos)
      const cardholderAmountCents = Math.round(amountCents * 0.025);
      // settlementAmount = amount - cardholderAmount (lo que recibe el beneficiario)
      const settlementAmountCents = amountCents - cardholderAmountCents;

      const formattedAmount = amountCents.toString().padStart(12, '0');
      const formattedSettlementAmount = settlementAmountCents.toString().padStart(12, '0');
      const formattedCardholderAmount = cardholderAmountCents.toString().padStart(12, '0');

      // merchantId: código del tenant padded a 15 caracteres
      const merchantId = (tenant.code || tenant.nit).padStart(15, '0');

      // clientReference: ID de la transacción como referencia anti-replay
      const clientReference = `TXN-${transactionId}`;

      this.logger.log(
        `Llamando SGT /transfer: amount=${formattedAmount}, settlement=${formattedSettlementAmount}, commission=${formattedCardholderAmount}, merchant=${merchantId}, ref=${clientReference}`,
      );

      // Step 6: Llamar al SGT /transfer
      const transferResult = await this.sgtCardPort.transfer({
        token: card.token,
        pin: pinblockResult.getValue(),
        amount: formattedAmount,
        settlementAmount: formattedSettlementAmount,
        cardholderAmount: formattedCardholderAmount,
        beneficiaryAccount,
        clientReference,
        type: 'payment',
        merchantId,
        idNumber: user.idNumber,
      });

      if (transferResult.isFailure) {
        const error = transferResult.getError();
        this.logger.error(
          `SGT /transfer falló para transacción=${transactionId}: ${error.message}`,
        );
        return this.failAndReturn(transactionId, tenantId, customerId, error.message);
      }

      const sgtResponse = transferResult.getValue();
      const transferCode = sgtResponse.data?.transferCode;

      this.logger.log(
        `SGT /transfer respondió para transacción=${transactionId}: transferCode=${transferCode}`,
      );

      // Step 7: Evaluar código de transferencia
      const isSuccess =
        transferCode === TRANSFER_CODES.TR000.code ||
        transferCode === TRANSFER_CODES.TR002.code;

      if (isSuccess) {
        const updatedTransaction = await this.transactionsRepository.updateStatus(
          transactionId,
          TransactionStatus.SUCCESS,
          {
            processedAt: new Date(),
            sgtTransferCode: transferCode,
            sgtIsoResponseCode: sgtResponse.data?.isoResponseCode,
          },
        );

        // Actualizar balance de la tarjeta si viene en la respuesta
        if (sgtResponse.data?.balance) {
          const newBalance = (parseInt(sgtResponse.data.balance, 10) || 0) / 100;
          await this.cardsRepository.update(cardId, { balance: newBalance });
        }

        this.logger.log(`Transacción ${transactionId} procesada exitosamente`);

        this.auditService.logAllow('TRANSACTION_PAYMENT_SUCCESS', 'transaction', transactionId, {
          module: 'transactions',
          severity: 'MEDIUM',
          tags: ['transactions', 'payment', 'success'],
          actorId: customerId,
          changes: {
            after: {
              status: TransactionStatus.SUCCESS,
              transferCode,
              isoResponseCode: sgtResponse.data?.isoResponseCode,
            },
          },
        });

        this.eventEmitter.emit(
          'transaction.processed',
          new TransactionProcessedEvent(transactionId, tenantId, 'success'),
        );

        return {
          success: true,
          status: TransactionStatus.SUCCESS,
          transferCode,
          isoResponseCode: sgtResponse.data?.isoResponseCode,
          updatedTransaction,
        };
      } else {
        // Transferencia rechazada o error de comunicación
        const transferCodeInfo = TRANSFER_CODES[transferCode as keyof typeof TRANSFER_CODES];
        const errorMsg = transferCodeInfo?.message || `Código SGT desconocido: ${transferCode}`;

        const updatedTransaction = await this.transactionsRepository.updateStatus(
          transactionId,
          TransactionStatus.FAILED,
          {
            processedAt: new Date(),
            sgtTransferCode: transferCode,
            sgtIsoResponseCode: sgtResponse.data?.isoResponseCode,
          },
        );

        this.logger.warn(`Transacción ${transactionId} falló: ${errorMsg}`);

        this.auditService.logAllow('TRANSACTION_PAYMENT_FAILED', 'transaction', transactionId, {
          module: 'transactions',
          severity: 'HIGH',
          tags: ['transactions', 'payment', 'failed'],
          actorId: customerId,
          changes: {
            after: {
              status: TransactionStatus.FAILED,
              transferCode,
              isoResponseCode: sgtResponse.data?.isoResponseCode,
              error: errorMsg,
            },
          },
        });

        this.eventEmitter.emit(
          'transaction.processed',
          new TransactionProcessedEvent(transactionId, tenantId, 'failed', errorMsg),
        );

        return {
          success: false,
          status: TransactionStatus.FAILED,
          transferCode,
          isoResponseCode: sgtResponse.data?.isoResponseCode,
          error: errorMsg,
          updatedTransaction,
        };
      }
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error procesando pago para transacción=${transactionId}: ${errorMsg}`,
        error,
      );

      return this.failAndReturn(transactionId, tenantId, customerId, errorMsg);
    }
  }

  /**
   * Marca transacción como FAILED, audita, emite evento y retorna el resultado
   */
  private async failAndReturn(
    transactionId: string,
    tenantId: string,
    customerId: string,
    errorMsg: string,
  ): Promise<PaymentResult> {
    const updatedTransaction = await this.transactionsRepository.updateStatus(
      transactionId,
      TransactionStatus.FAILED,
      { processedAt: new Date() },
    );

    this.auditService.logError(
      'TRANSACTION_PAYMENT_ERROR',
      'transaction',
      transactionId,
      new Error(errorMsg),
      {
        module: 'transactions',
        severity: 'HIGH',
        tags: ['transactions', 'payment', 'error'],
        actorId: customerId,
      },
    );

    this.eventEmitter.emit(
      'transaction.processed',
      new TransactionProcessedEvent(transactionId, tenantId, 'failed', errorMsg),
    );

    return {
      success: false,
      status: TransactionStatus.FAILED,
      error: errorMsg,
      updatedTransaction,
    };
  }
}
