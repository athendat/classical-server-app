import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model, QueryFilter } from 'mongoose';

import { CardsRepository } from 'src/modules/cards/infrastructure/adapters';
import { ITransactionsRepository } from '../../domain/ports/transactions.repository';
import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';

import { AsyncContextService } from 'src/common/context';

import { Transaction, TransactionStatus } from '../../domain/entities/transaction.entity';

import { Card } from 'src/modules/cards/infrastructure/schemas/card.schema';
import { Tenant } from 'src/modules/tenants/infrastructure/schemas/tenant.schema';
import { TransactionSchema } from '../schemas/transaction.schema';
import { User } from 'src/modules/users/infrastructure/schemas/user.schema';

/**
 * Adapter: Implementación de repositorio de transacciones con MongoDB
 */
@Injectable()
export class TransactionsRepository implements ITransactionsRepository {
  private readonly logger = new Logger(TransactionsRepository.name);

  constructor(
    @InjectModel(TransactionSchema.name)
    private readonly transactionModel: Model<TransactionSchema>,
    
    private readonly asyncContextService: AsyncContextService,
    private readonly cardsRepository: CardsRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly usersRepository: UsersRepository,

  ) { }

  async create(transaction: Transaction): Promise<Transaction> {
    try {
      const created = await this.transactionModel.create({
        ...transaction,
      });
      return this.mapToDomain(created);
    } catch (error: any) {
      this.logger.error(`Error creando transacción: ${error.message}`);
      throw error;
    }
  }

  async findById(id: string): Promise<Transaction | null> {
    try {
      const document = await this.transactionModel.findOne({ id });
      return document ? this.mapToDomain(document) : null;
    } catch (error: any) {
      this.logger.error(`Error buscando transacción por ID: ${error.message}`);
      throw error;
    }
  }

  async findByRef(ref: string, transactionId: string): Promise<Transaction | null> {
    try {
      const document = await this.transactionModel.findOne({ ref, transactionId });
      return document ? this.mapToDomain(document) : null;
    } catch (error: any) {
      this.logger.error(`Error buscando transacción por ref: ${error.message}`);
      throw error;
    }
  }

  async findByIntentId(tenantId: string, intentId: string): Promise<Transaction | null> {
    try {
      const document = await this.transactionModel.findOne({ tenantId, intentId });
      return document ? this.mapToDomain(document) : null;
    } catch (error: any) {
      this.logger.error(`Error buscando transacción por intentId: ${error.message}`);
      throw error;
    }
  }

  async findByTenantId(
    tenantId: string,
    filter: QueryFilter<Transaction>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Transaction[]; total: number }> {
    try {

      const [transactions, total] = await Promise.all([
        this.transactionModel
          .find({ tenantId, ...filter } as any)
          .sort((options.sort || { createdAt: -1 }) as any)
          .skip(options.skip)
          .limit(options.limit)
          .select(
            {
              _id: 0,
              id: 1,
              cardId: 1,
              no: 1,
              ref: 1,
              status: 1,
              amount: 1,
              tenantName: 1,
              expiresAt: 1,
              createdAt: 1
            },
          )
          .lean()
          .exec(),
        this.transactionModel.countDocuments({ tenantId, ...filter } as any).exec(),
      ]);

      return {
        data: transactions.map((doc) => this.mapToDomain(doc)),
        total,
      };
    } catch (error: any) {
      this.logger.error(`Error listando transacciones del transaction: ${error.message}`);
      throw error;
    }
  }


  async findByCustomerId(
    customerId: string,
    filter: QueryFilter<Transaction>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Transaction[]; total: number }> {
    try {

      const [transactions, total] = await Promise.all([
        this.transactionModel
          .find({ customerId, ...filter } as any)
          .sort((options.sort || { createdAt: -1 }) as any)
          .skip(options.skip)
          .limit(options.limit)
          .select(
            {
              _id: 0,
              id: 1,
              cardId: 1,
              no: 1,
              ref: 1,
              status: 1,
              amount: 1,
              tenantName: 1,
              expiresAt: 1,
              createdAt: 1
            },
          )
          .lean()
          .exec(),
        this.transactionModel.countDocuments({ customerId, ...filter } as any).exec(),
      ]);

      return {
        data: transactions.map((doc) => this.mapToDomain(doc)),
        total,
      };
    } catch (error: any) {
      this.logger.error(`Error listando transacciones del cliente: ${error.message}`);
      throw error;
    }
  }

  async findAll(
    filter: QueryFilter<Transaction>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{
    data: Transaction[];
    total: number,
    meta?: {
      customers?: User[],
      tenants?: Tenant[],
      cards?: Card[]
    }
  }> {
    try {
      this.logger.log(
        `Finding Transactions with filter: ${JSON.stringify(filter)}, skip=${options.skip}, limit=${options.limit}`,
      );

      // Definir si el usuario que hace la petición un merchant
      const userId = this.asyncContextService.getActorId()!;
      const user = await this.usersRepository.findById(userId);
      const isMerchant = user!.roleKey === 'merchant' || user!.additionalRoleKeys?.includes('merchant');

      // Definir filtro de tenant si el usuario es un merchant
      if (isMerchant) {
        const tenantId = user!.tenantId!;
        filter.tenantId = tenantId;
        this.logger.log(`User ${userId} is a merchant, applying tenant filter: ${tenantId}`);
      }

      // Ejecutar query en paralelo: obtener documentos y contar total
      const [transactions, total] = await Promise.all([
        this.transactionModel
          .find(filter as any)
          .sort((options.sort || { createdAt: -1 }) as any)
          .skip(options.skip)
          .limit(options.limit)
          .select(
            {
              _id: 0,
              id: 1,
              cardId: 1,
              no: 1,
              ref: 1,
              status: 1,
              amount: 1,
              tenantName: 1,
              expiresAt: 1,
              createdAt: 1,
              customerId: 1,
              tenantId: 1
            },
          )
          .lean()
          .exec(),
        this.transactionModel.countDocuments(filter as any).exec(),
      ]);

      // Obtener listado de todos los clientes que están en las transacciones listadas (para evitar N+1)
      const customerIds = Array.from(new Set(transactions.map((t) => t.customerId)));
      const customers = customerIds.length ? await this.usersRepository.findByIds(customerIds) : [];

      // Obtener listado de todos los tenants que están en las transacciones listadas (para evitar N+1)
      const tenantIds = Array.from(new Set(transactions.map((t) => t.tenantId)));
      const tenants = await this.tenantsRepository.findByIds(tenantIds);

      // Obtener listado de todas las tarjetas que están en las transacciones listadas (para evitar N+1)
      const cardIds = Array.from(new Set(transactions.map((t) => t.cardId))).filter(
        (id): id is string => typeof id === 'string',
      );
      const cards = cardIds.length ? await this.cardsRepository.findByIds(cardIds) : [];

      this.logger.log(
        `Found ${transactions.length} Transactions (total: ${total}, skip: ${options.skip}, limit: ${options.limit})`,
      );

      return {
        data: transactions as unknown as Transaction[],
        total,
        meta: {
          cards,
          customers,
          tenants,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error finding Transactions with filter: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new Error(
        `Find with filter failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async updateStatus(id: string, status: string, updates?: Record<string, any>): Promise<Transaction | null> {
    try {
      const updateData = {
        status,
        updatedAt: new Date(),
        ...updates,
      };

      const updated = await this.transactionModel.findOneAndUpdate({ id }, updateData, { new: true });
      return updated ? this.mapToDomain(updated) : null;
    } catch (error: any) {
      this.logger.error(`Error actualizando estado de transacción: ${error.message}`);
      throw error;
    }
  }

  async update(id: string, updates: Partial<Transaction>): Promise<Transaction | null> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      const updated = await this.transactionModel.findOneAndUpdate({ id }, updateData, { new: true });
      return updated ? this.mapToDomain(updated) : null;
    } catch (error: any) {
      this.logger.error(`Error actualizando transacción: ${error.message}`);
      throw error;
    }
  }

  async findExpired(): Promise<Transaction[]> {
    try {
      const now = new Date();
      const documents = await this.transactionModel.find({
        status: TransactionStatus.NEW,
        expiresAt: { $lte: now },
      });

      return documents.map((doc) => this.mapToDomain(doc));
    } catch (error: any) {
      this.logger.error(`Error buscando transacciones expiradas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de volumen de transacciones para un rango de fechas
   * Retorna suma actual y suma del período anterior de igual duración
   */
  async getTransactionVolumeStats(
    dateFrom: string,
    dateTo: string,
    tenantId?: string,
  ): Promise<{ current: number; previous: number }> {
    try {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const rangeDuration = to.getTime() - from.getTime();
      const previousFrom = new Date(from.getTime() - rangeDuration);

      const filter = tenantId ? { tenantId } : {};

      const [current, previous] = await Promise.all([
        this.transactionModel.aggregate([
          {
            $match: {
              ...filter,
              createdAt: { $gte: from, $lte: to },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
            },
          },
        ]),
        this.transactionModel.aggregate([
          {
            $match: {
              ...filter,
              createdAt: { $gte: previousFrom, $lt: from },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
            },
          },
        ]),
      ]);

      return {
        current: current[0]?.total ?? 0,
        previous: previous[0]?.total ?? 0,
      };
    } catch (error: any) {
      this.logger.error(`Error obteniendo estadísticas de volumen: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de conteo de transacciones para un rango de fechas
   * Retorna conteo actual y conteo del período anterior de igual duración
   */
  async getTransactionCountStats(
    dateFrom: string,
    dateTo: string,
    tenantId?: string,
  ): Promise<{ current: number; previous: number }> {
    try {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const rangeDuration = to.getTime() - from.getTime();
      const previousFrom = new Date(from.getTime() - rangeDuration);

      const filter = tenantId ? { tenantId } : {};

      const [current, previous] = await Promise.all([
        this.transactionModel.countDocuments({
          ...filter,
          createdAt: { $gte: from, $lte: to },
        }),
        this.transactionModel.countDocuments({
          ...filter,
          createdAt: { $gte: previousFrom, $lt: from },
        }),
      ]);

      return {
        current,
        previous,
      };
    } catch (error: any) {
      this.logger.error(`Error obteniendo estadísticas de conteo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene tendencias diarias por día de la semana
   * Agrupa transacciones exitosas (no CANCELLED, no EXPIRED) y fallidas
   */
  async getDailyTrendByDayOfWeek(
    dateFrom: string,
    dateTo: string,
    tenantId?: string,
  ): Promise<
    Array<{
      dayOfWeek: number;
      dayOfWeekName: string;
      successfulCount: number;
      failedCount: number;
      successfulAmount: number;
      failedAmount: number;
    }>
  > {
    try {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const filter = tenantId ? { tenantId } : {};

      const pipeline = [
        {
          $match: {
            ...filter,
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: {
              dayOfWeek: { $dayOfWeek: '$createdAt' },
              status: '$status',
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
        {
          $group: {
            _id: '$_id.dayOfWeek',
            statusMetrics: {
              $push: {
                status: '$_id.status',
                count: '$count',
                amount: '$totalAmount',
              },
            },
          },
        },
        {
          $project: {
            dayOfWeek: '$_id',
            successfulCount: {
              $sum: {
                $sum: [
                  {
                    $sum: {
                      $map: {
                        input: '$statusMetrics',
                        as: 'metric',
                        in: {
                          $cond: [
                            {
                              $and: [
                                { $ne: ['$$metric.status', 'cancelled'] },
                                { $ne: ['$$metric.status', 'expired'] },
                              ],
                            },
                            '$$metric.count',
                            0,
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
            failedCount: {
              $sum: {
                $sum: {
                  $map: {
                    input: '$statusMetrics',
                    as: 'metric',
                    in: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ['$$metric.status', 'cancelled'] },
                            { $eq: ['$$metric.status', 'expired'] },
                          ],
                        },
                        '$$metric.count',
                        0,
                      ],
                    },
                  },
                },
              },
            },
            successfulAmount: {
              $sum: {
                $sum: {
                  $map: {
                    input: '$statusMetrics',
                    as: 'metric',
                    in: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ['$$metric.status', 'cancelled'] },
                            { $ne: ['$$metric.status', 'expired'] },
                          ],
                        },
                        '$$metric.amount',
                        0,
                      ],
                    },
                  },
                },
              },
            },
            failedAmount: {
              $sum: {
                $sum: {
                  $map: {
                    input: '$statusMetrics',
                    as: 'metric',
                    in: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ['$$metric.status', 'cancelled'] },
                            { $eq: ['$$metric.status', 'expired'] },
                          ],
                        },
                        '$$metric.amount',
                        0,
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        {
          $sort: { dayOfWeek: 1 },
        },
      ] as any[];

      const results = await this.transactionModel.aggregate(pipeline);

      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      return results.map((doc: any) => ({
        dayOfWeek: doc.dayOfWeek,
        dayOfWeekName: daysOfWeek[doc.dayOfWeek - 1] || 'Unknown',
        successfulCount: doc.successfulCount || 0,
        failedCount: doc.failedCount || 0,
        successfulAmount: doc.successfulAmount || 0,
        failedAmount: doc.failedAmount || 0,
      }));
    } catch (error: any) {
      this.logger.error(`Error obteniendo tendencias diarias: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene distribución de transacciones por estado con porcentajes
   */
  async getStatusDistribution(
    dateFrom: string,
    dateTo: string,
    tenantId?: string,
  ): Promise<Array<{ status: string; count: number; percentage: number }>> {
    try {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const filter = tenantId ? { tenantId } : {};

      const pipeline = [
        {
          $match: {
            ...filter,
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $facet: {
            byStatus: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                },
              },
            ],
            total: [
              {
                $count: 'total',
              },
            ],
          },
        },
      ];

      const results = await this.transactionModel.aggregate(pipeline);
      const { byStatus, total } = results[0];
      const totalCount = total[0]?.total ?? 0;

      return byStatus.map((doc: any) => ({
        status: doc._id,
        count: doc.count,
        percentage: totalCount > 0 ? (doc.count / totalCount) * 100 : 0,
      }));
    } catch (error: any) {
      this.logger.error(`Error obteniendo distribución por estado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene las últimas N transacciones más recientes
   */
  async getRecentTransactions(limit: number = 10, tenantId?: string): Promise<Transaction[]> {
    try {
      const filter = tenantId ? { tenantId } : {};

      const documents = await this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();

      return documents.map((doc) => this.mapToDomain(doc));
    } catch (error: any) {
      this.logger.error(`Error obteniendo transacciones recientes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mapea documento de MongoDB a entidad de dominio
   */
  private mapToDomain(document: any): Transaction {
    return new Transaction({
      id: document.id,
      ref: document.ref,
      intentId: document.intentId,
      no: document.no,
      tenantId: document.tenantId,
      tenantName: document.tenantName,
      customerId: document.customerId,
      amount: document.amount * 0.01,
      status: document.status,
      cardId: document.cardId,
      ttlMinutes: document.ttlMinutes,
      expiresAt: document.expiresAt,
      signature: document.signature,
      stateSnapshot: document.stateSnapshot,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }
}
