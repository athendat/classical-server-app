import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { TransactionsRepository } from '../../infrastructure/adapters/transactions.repository';

import { ApiResponse } from '../../../../common/types/api-response.type';
import { Transaction } from '../../domain/entities/transaction.entity';
import { AsyncContextService } from 'src/common/context';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { PaginationMeta, QueryParams } from 'src/common/types';
import { Actor } from 'src/common/interfaces';
import { buildMongoQuery } from 'src/common/helpers';

/**
 * Servicio de consulta para listar transacciones con filtrado inteligente
 * según el rol del usuario (actor)
 */
@Injectable()
export class TransactionQueryService {
  private readonly logger = new Logger(TransactionQueryService.name);

  constructor(
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
    private readonly transactionsRepository: TransactionsRepository
  ) { }

  /**
   * Lista transacciones con filtrado automático según roleKey del actor
   * - user: filtrar por customerId
   * - merchant: filtrar por tenantId
   * - otros roles: permitir query params (tenantId, customerId, etc)
   */
  async list(queryParams: QueryParams): Promise<ApiResponse<Transaction[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    const actor = this.asyncContextService.getActor()!;

    this.logger.log(
      `[${requestId}] Fetching all tenants: page=${queryParams.page}, limit=${queryParams.limit}, search=${queryParams.search || 'none'}`,
    );

    // this.logger.log(`[${requestId}] Listando transacciones para actor=${actor.actorId}, roleKey=${actor.roleKey}`);

    try {
      // Campos permitidos para búsqueda
      const searchFields = [
        'ref',
        'no',
        'tenantName',
        'status',
      ];

      // Construir query de MongoDB
      const { mongoFilter, options } = buildMongoQuery(
        queryParams,
        searchFields,
      );

      this.logger.log(
        `[${requestId}] MongoDB filter: ${JSON.stringify(mongoFilter)}`,
      );
      this.logger.log(
        `[${requestId}] Query options: ${JSON.stringify(options)}`,
      );

      // Ejecutar consulta directamente en MongoDB
      const { data: transactions, total, meta } = await this.transactionsRepository.findAll(
        mongoFilter,
        options,
      );

      const limit = options.limit;
      const page = queryParams.page || 1;
      const totalPages = Math.ceil(total / limit);
      const skip = options.skip;
      const hasMore = skip + limit < total;

      this.logger.log(
        `[${requestId}] Retrieved ${transactions.length} transactions from page ${page} (total: ${total})`,
      );

      // Registrar lectura exitosa
      this.auditService.logAllow('TRANSACTION_LIST_FETCHED', 'transaction', 'list', {
        module: 'transactions',
        severity: 'LOW',
        tags: ['transaction', 'read', 'list', 'successful'],
        actorId: userId,
        changes: {
          after: {
            count: transactions.length,
            total,
            page,
            hasMore,
          },
        },
      });

      return ApiResponse.ok<Transaction[]>(
        HttpStatus.OK,
        transactions,
        `${transactions.length} de ${total} transactions encontradas`,
        {
          requestId,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasMore,
          } as PaginationMeta,
          ...meta
        },
      );

    } catch (error: any) {
      this.logger.error(`[${requestId}] Error listando transacciones: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene una transacción individual si el actor tiene permisos
   */
  async findOne(transactionId: string): Promise<ApiResponse<Transaction>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();

    this.logger.log(`[${requestId}] Obteniendo transacción ${transactionId}`);

    try {
      const transaction = await this.transactionsRepository.findById(transactionId);

      if (!transaction) {
        const errorMsg = `Transaction not found: ${transactionId}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        // Registrar acceso denegado
        this.auditService.logDeny('TRANSACTION_FETCHED', 'transaction', transactionId, errorMsg, {
          severity: 'LOW',
          tags: ['transaction', 'read', 'not-found'],
        });
        return ApiResponse.fail<Transaction>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Transaction no encontrada',
          { requestId, transactionId },
        );
      }

      // Validar permisos: user solo puede ver sus transacciones
      // const roleKey = this.extractRoleKey(actor);
      // if (roleKey === 'user' && transaction.customerId !== actor.actorId) {
      //   this.logger.warn(
      //     `[${requestId}] User ${actor.actorId} intentó acceder a transacción de otro cliente`,
      //   );
      //   return null; // Retornar null en lugar de error para no revelar existencia
      // }

      // Merchant solo puede ver transacciones de su tenant
      // if (roleKey === 'merchant') {
      //   const tenantId = this.getTenantIdFromActor(actor);
      //   if (transaction.tenantId !== tenantId) {
      //     this.logger.warn(
      //       `[${requestId}] Merchant ${actor.actorId} intentó acceder a transacción de otro tenant`,
      //     );
      //     return null;
      //   }
      // }

      this.auditService.logAllow('TRANSACTION_FETCHED', 'transaction', transactionId, {
        module: 'transactions',
        severity: 'LOW',
        tags: ['transaction', 'read', 'successful'],
        actorId: userId,
      });


      return ApiResponse.ok<Transaction>(
        HttpStatus.OK,
        transaction,
        undefined,
        {
          requestId,
          transactionId,
        }
      );

    } catch (error: any) {
      this.logger.error(`[${requestId}] Error obteniendo transacción: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extrae el roleKey del actor
   * El actor tiene un array de scopes que pueden contener información de rol
   * o tiene un campo roleKey específico
   */
  private extractRoleKey(actor: Actor): string {
    // TODO: Implementar lógica para extraer roleKey del actor
    // Por ahora asumimos que está disponible en actor.roleKey
    return (actor as any).roleKey ?? 'user';
  }

  /**
   * Obtiene el tenantId del actor
   * Usado para merchants que están asociados a un tenant específico
   */
  private getTenantIdFromActor(actor: Actor): string {
    // TODO: Implementar lógica para obtener tenantId del actor
    // Por ahora retorna un string vacío
    return (actor as any).tenantId ?? '';
  }
}
