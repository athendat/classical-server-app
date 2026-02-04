import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { Transaction } from '../../domain/entities/transaction.entity';
import { ITransactionsRepository } from '../../domain/ports/transactions.repository';
import { TransactionSchema } from '../schemas/transaction.schema';
import { TransactionStatus } from '../../domain/entities/transaction.entity';

/**
 * Adapter: Implementación de repositorio de transacciones con MongoDB
 */
@Injectable()
export class TransactionsRepository implements ITransactionsRepository {
  private readonly logger = new Logger(TransactionsRepository.name);

  constructor(
    @InjectModel(TransactionSchema.name)
    private readonly transactionModel: Model<TransactionSchema>,
  ) { }

  async create(transaction: Transaction): Promise<Transaction> {
    try {
      const created = await this.transactionModel.create({
        ...transaction,
      });
      return this.mapToDomain(created);
    } catch (error) {
      this.logger.error(`Error creando transacción: ${error.message}`);
      throw error;
    }
  }

  async findById(id: string): Promise<Transaction | null> {
    try {
      const document = await this.transactionModel.findOne({ id });
      return document ? this.mapToDomain(document) : null;
    } catch (error) {
      this.logger.error(`Error buscando transacción por ID: ${error.message}`);
      throw error;
    }
  }

  async findByRef(ref: string, transactionId: string): Promise<Transaction | null> {
    try {
      const document = await this.transactionModel.findOne({ ref, transactionId });
      return document ? this.mapToDomain(document) : null;
    } catch (error) {
      this.logger.error(`Error buscando transacción por ref: ${error.message}`);
      throw error;
    }
  }

  async findByIntentId(tenantId: string, intentId: string): Promise<Transaction | null> {
    try {
      const document = await this.transactionModel.findOne({ tenantId, intentId });
      return document ? this.mapToDomain(document) : null;
    } catch (error) {
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
          .lean()
          .exec(),
        this.transactionModel.countDocuments({ tenantId, ...filter } as any).exec(),
      ]);

      return {
        data: transactions.map((doc) => this.mapToDomain(doc)),
        total,
      };
    } catch (error) {
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
          .lean()
          .exec(),
        this.transactionModel.countDocuments({ customerId, ...filter } as any).exec(),
      ]);

      return {
        data: transactions.map((doc) => this.mapToDomain(doc)),
        total,
      };
    } catch (error) {
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
  ): Promise<{ data: Transaction[]; total: number }> {
    try {
      this.logger.debug(
        `Finding Transactions with filter: ${JSON.stringify(filter)}, skip=${options.skip}, limit=${options.limit}`,
      );

      // Ejecutar query en paralelo: obtener documentos y contar total
      const [transactions, total] = await Promise.all([
        this.transactionModel
          .find(filter as any)
          .sort((options.sort || { createdAt: -1 }) as any)
          .skip(options.skip)
          .limit(options.limit)
          .lean()
          .exec(),
        this.transactionModel.countDocuments(filter as any).exec(),
      ]);

      this.logger.debug(
        `Found ${transactions.length} Transactions (total: ${total}, skip: ${options.skip}, limit: ${options.limit})`,
      );

      return {
        data: transactions as unknown as Transaction[],
        total,
      };
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      this.logger.error(`Error buscando transacciones expiradas: ${error.message}`);
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
      amount: document.amount,
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
