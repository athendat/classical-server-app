import { Injectable, Logger, BadRequestException, NotFoundException, HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Transaction, TransactionStatus } from '../../domain/entities/transaction.entity';

import { isValidTransition } from '../../domain/state-machines/transaction.state-machine';
import {
  TransactionCreatedEvent,
  TransactionConfirmedEvent,
  TransactionCancelledEvent,
  TransactionExpiredEvent,
} from '../../domain/events/transaction.events';
import { CreateTransactionDto, ConfirmTransactionDto, CreateTransactionResponseDto } from '../../dto/transactions.dto';
import { TransactionsRepository } from '../../infrastructure/adapters/transactions.repository';
import { MongoDbSequenceAdapter } from '../../infrastructure/adapters/sequence.adapter';
import { CryptoService } from 'src/common/crypto/crypto.service';
import { EmvcoService } from 'src/common/emvco/emvco.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { ApiResponse } from 'src/common/types';
import { AsyncContextService } from 'src/common/context';
import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';

/**
 * Servicio de aplicación para transacciones
 * Orquesta la lógica de negocio entre dominio e infraestructura
 */
@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
    private readonly cryptoService: CryptoService,
    private readonly emvcoService: EmvcoService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequencePort: MongoDbSequenceAdapter,
    private readonly tenantsRepository: TenantsRepository,
    private readonly transactionsRepository: TransactionsRepository,
  ) { }

  /**
   * Crea una nueva transacción
   * Genera ID, número secuencial, calcula expiración y firma HMAC del QR
   */
  async create(dto: CreateTransactionDto): Promise<ApiResponse<CreateTransactionResponseDto>> {
    // ⭐ OBTENER del contexto en lugar de generar
    const requestId = this.asyncContextService.getRequestId();
    const tenantId = this.asyncContextService.getActorId();

    this.logger.log(`[${requestId}] Creando transacción para tenant=${tenantId}`);

    try {

      // Validar idempotencia: buscar si ya existe una transacción con el mismo intentId
      const existingTransaction = await this.transactionsRepository.findByIntentId(
        tenantId!,
        dto.intentId,
      );
      if (existingTransaction) {
        this.logger.log(
          `[${requestId}] Transacción con intentId=${dto.intentId} ya existe, retornando existente`,
        );
        // Retornar la transacción existente (idempotencia)
        const emvco = this.emvcoService.generatePaymentQR({
          id: existingTransaction.id,
          ref: existingTransaction.ref,
          no: existingTransaction.no,
          tenantName: existingTransaction.tenantName,
          amount: existingTransaction.amount,
          expiresAt: existingTransaction.expiresAt.toISOString(),
        });

        return ApiResponse.ok<CreateTransactionResponseDto>(
          HttpStatus.CREATED,
          {
            id: existingTransaction.id,
            intentId: existingTransaction.intentId,
            ref: existingTransaction.ref,
            no: existingTransaction.no,
            amount: existingTransaction.amount,
            expiresAt: existingTransaction.expiresAt,
            emvco,
            signature: existingTransaction.signature,
          },
          'Transacción creada exitosamente (retorno de reintento)',
          { requestId },
        );
      }

      // Obtener datos del Tenant
      const tenant = await this.tenantsRepository.findById(tenantId!);
      if (!tenant) {
        const errorMsg = `Tenant not found: ${tenantId}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        // Registrar acceso denegado
        this.auditService.logDeny('TENANT_FETCHED', 'tenant', tenantId!, errorMsg, {
          severity: 'LOW',
          tags: ['tenant', 'read', 'not-found'],
        });
        return ApiResponse.fail<CreateTransactionResponseDto>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Tenant no encontrado',
          { requestId, tenantId },
        );
      }

      // Obtener próximo número secuencial
      const no = await this.sequencePort.getNextTransactionNo();

      // Calcular fecha de expiración
      const ttlMinutes = dto.ttlMinutes || 15; // Valor por defecto 15 minutos
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

      // Crear entidad
      const transaction = new Transaction({
        ref: dto.ref,
        intentId: dto.intentId,
        no,
        tenantId: tenant.id,
        tenantName: tenant.businessName, // Usar nombre real del tenant desde base de datos
        amount: dto.amount,
        ttlMinutes,
        expiresAt,
        status: TransactionStatus.NEW,
      });

      // Generar payload del QR en formato EMVCo
      const emvco = this.emvcoService.generatePaymentQR({
        id: transaction.id,
        ref: transaction.ref,
        no: transaction.no,
        tenantName: transaction.tenantName,
        amount: transaction.amount,
        expiresAt: transaction.expiresAt.toISOString(),
      });

      // Firmar payload con HMAC
      // Nota: Usar un secret universal por ahora, luego se podrá personalizar por tenant
      transaction.signature = this.cryptoService.createSignature(transaction.id, transaction.ref);

      // Persistir
      const created = await this.transactionsRepository.create(transaction);

      // Auditar
      this.auditService.logAllow('TRANSACTION_CREATED', 'transaction', created.id, {
        module: 'transactions',
        severity: 'MEDIUM',
        tags: ['transactions'],
        actorId: tenantId,
        changes: {
          after: { ...created },
        },
      });

      // Emitir evento de dominio
      this.eventEmitter.emit(
        'transaction.created',
        new TransactionCreatedEvent(
          created.id,
          created.tenantId,
          created.customerId,
          created.ref,
          created.no,
          created.amount,
          created.expiresAt,
        ),
      );

      // Retornar DTO de respuesta sin el secret completo
      return ApiResponse.ok<CreateTransactionResponseDto>(
        HttpStatus.CREATED,
        {
          id: created.id,
          intentId: created.intentId,
          ref: created.ref,
          no: created.no,
          amount: created.amount,
          expiresAt: created.expiresAt,
          emvco,
          signature: transaction.signature,
        },
        'Transacción creada exitosamente',
        { requestId }
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to create tenant: ${errorMsg}`,
        error,
      );

      this.auditService.logError(
        'TRANSACTION_CREATE',
        'transaction',
        'unknown',
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'transactions',
          severity: 'HIGH',
          tags: ['tenant', 'creation', 'error'],
          actorId: tenantId,
        },
      );

      return ApiResponse.fail<CreateTransactionResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error desconocido',
      );
    }
  }

  /**
   * Confirma una transacción con el cardId y valida la firma
   * Transiciona de 'new' a 'processing'
   */
  async confirm(
    dto: ConfirmTransactionDto,
  ): Promise<ApiResponse<Transaction>> {

    // ⭐ OBTENER del contexto en lugar de generar
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;

    this.logger.log(`[${requestId}] Confirmando transacción ${dto.transactionId}`);

    try {
      // Buscar transacción
      const transaction = await this.transactionsRepository.findById(dto.transactionId);
      if (!transaction) {
        throw new NotFoundException('Transacción no encontrada');
      }

      // Validar que esté en estado 'new'
      if (transaction.status !== TransactionStatus.NEW) {
        const errorMsg = `No se puede confirmar una transacción en estado ${transaction.status}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<Transaction>(
          HttpStatus.NOT_ACCEPTABLE,
          'No se puede confirmar una transacción en este estado',
          'Estado inválido',
        );
      }

      // Validar que la firma coincida
      // TODO: Implementar validación de firma cuando se tenga el sistema de secrets del tenant
      // const isValid = this.cryptoService.verifySignature(payload, dto.signature, secret);
      // if (!isValid) {
      //   throw new BadRequestException('Firma del QR inválida o manipulada');
      // }

      // Transicionar a processing
      transaction.markAsProcessing(dto.cardId);

      // Persistir cambios
      const updated = await this.transactionsRepository.updateStatus(
        dto.transactionId,
        TransactionStatus.PROCESSING,
        { cardId: dto.cardId, customerId: userId },
      );

      if (!updated) {
        const errorMsg = `No se pudo confirmar una transacción`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<Transaction>(
          HttpStatus.NOT_MODIFIED,
          'No se pudo confirmar una transacción',
          'Error al confirmar',
        );
      }

      // Auditar
      this.auditService.logAllow('TRANSACTION_CONFIRMED', 'transaction', dto.transactionId, {
        module: 'transactions',
        severity: 'MEDIUM',
        tags: ['transactions', 'confirmation', 'success'],
        actorId: userId,
        changes: {
          before: { ...transaction },
          after: { ...updated },
        },
      });

      // Emitir evento
      this.eventEmitter.emit(
        'transaction.confirmed',
        new TransactionConfirmedEvent(
          dto.transactionId,
          transaction.tenantId,
          transaction.customerId,
          dto.cardId,
        ),
      );

      return ApiResponse.ok<Transaction>(
        HttpStatus.ACCEPTED,
        updated,
        'Transacción confirmada exitosamente',
        {
          requestId,
          tenantId: transaction.tenantId,
          customerId: transaction.customerId,
          transactionId: transaction.id
        }
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to confirm transaction: ${errorMsg}`,
        error,
      );

      this.auditService.logError(
        'TRANSACTION_CONFIRMED',
        'transaction',
        'unknown',
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'transactions',
          severity: 'HIGH',
          tags: ['transactions', 'confirmation', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Transaction>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error desconocido',
      );
    }
  }

  /**
   * Cancela una transacción
   * Solo se puede cancelar desde estado 'new' o 'processing'
   */
  async cancel(transactionId: string): Promise<ApiResponse<Transaction>> {
    // ⭐ OBTENER del contexto en lugar de generar
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;

    this.logger.log(`[${requestId}] Cancelando transacción ${transactionId}`);

    try {
      // Buscar transacción
      const transaction = await this.transactionsRepository.findById(transactionId);
      if (!transaction) {
        const errorMsg = `Transacción no encontrada: ${transactionId}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<Transaction>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Transacción no encontrada',
        );
      }

      // Validar transición válida
      if (!isValidTransition(transaction.status as any, TransactionStatus.CANCELLED)) {
        const errorMsg = `No se puede cancelar una transacción en estado ${transaction.status}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<Transaction>(
          HttpStatus.NOT_ACCEPTABLE,
          errorMsg,
          `No se puede cancelar una transacción en estado ${transaction.status}`,
        );
      }

      // Persistir cambios
      const updated = await this.transactionsRepository.updateStatus(
        transactionId,
        TransactionStatus.CANCELLED,
        { customerId: userId },
      );

      if (!updated) {
        const errorMsg = `No se pudo cancelar una transacción`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<Transaction>(
          HttpStatus.NOT_MODIFIED,
          'No se pudo cancelar una transacción',
          'Error al cancelar',
        );
      }

      // Auditar
      this.auditService.logAllow('TRANSACTION_CANCELLED', 'transaction', transactionId, {
        module: 'transactions',
        severity: 'MEDIUM',
        tags: ['transactions', 'cancellation', 'success'],
        actorId: userId,
        changes: {
          before: { ...transaction },
          after: { ...updated },
        },
      });

      // Emitir evento
      this.eventEmitter.emit(
        'transaction.cancelled',
        new TransactionCancelledEvent(transactionId, transaction.tenantId),
      );

      return ApiResponse.ok<Transaction>(
        HttpStatus.ACCEPTED,
        updated,
        'Transacción cancelada exitosamente',
        {
          requestId,
          tenantId: transaction.tenantId,
          customerId: transaction.customerId,
          transactionId: transaction.id
        }
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to cancel transaction: ${errorMsg}`,
        error,
      );

      this.auditService.logError(
        'TRANSACTION_CANCELLED',
        'transaction',
        'unknown',
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'transactions',
          severity: 'HIGH',
          tags: ['transactions', 'cancellation', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Transaction>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error desconocido',
      );
    }
  }

  /**
   * Marca transacciones expiradas como canceladas
   * Usada por la tarea cron
   */
  async expireTransactions(): Promise<number> {
    this.logger.log('Buscando transacciones expiradas...');

    try {
      const expiredTransactions = await this.transactionsRepository.findExpired();
      this.logger.log(`Encontradas ${expiredTransactions.length} transacciones expiradas`);

      let count = 0;
      for (const transaction of expiredTransactions) {
        try {
          const updated = await this.transactionsRepository.updateStatus(
            transaction.id,
            TransactionStatus.CANCELLED,
          );

          if (updated) {
            count++;
            // Emitir evento
            this.eventEmitter.emit(
              'transaction.expired',
              new TransactionExpiredEvent(transaction.id, transaction.tenantId),
            );

            // Auditar
            this.auditService.logAllow('TRANSACTION_EXPIRED', 'transaction', transaction.id, {
              tags: ['transactions', 'system'],
            });
          }
        } catch (error: any) {
          this.logger.error(
            `Error expirando transacción ${transaction.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(`${count} transacciones marcadas como expiradas`);
      return count;
    } catch (error: any) {
      this.logger.error(`Error en tarea de expiración: ${error.message}`);
      return 0;
    }
  }
}
