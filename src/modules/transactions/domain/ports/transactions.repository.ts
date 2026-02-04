import { QueryFilter } from 'mongoose';
import { Transaction } from '../entities/transaction.entity';

/**
 * Puerto: Interfaz para operaciones de persistencia de transacciones
 * Implementación: MongoDB adapter
 */
export interface ITransactionsRepository {
  /**
   * Crea una nueva transacción
   */
  create(transaction: Transaction): Promise<Transaction>;

  /**
   * Busca transacción por ID
   */
  findById(id: string): Promise<Transaction | null>;

  /**
   * Busca transacción por referencia del cliente (única por tenant)
   */
  findByRef(ref: string, tenantId: string): Promise<Transaction | null>;

  /**
   * Busca transacción por intentId para validar idempotencia
   */
  findByIntentId(tenantId: string, intentId: string): Promise<Transaction | null>;

  /**
   * Lista transacciones de un tenant
   */
  findByTenantId(
    tenantId: string,
    filter: QueryFilter<Transaction>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Transaction[]; total: number }>;

  /**
   * Lista transacciones de un cliente
   */
  findByCustomerId(
    customerId: string,
    filter: QueryFilter<Transaction>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Transaction[]; total: number }>;

  /**
   * Lista todas las transacciones con filtros opcionales
   */
  findAll(
    filter: QueryFilter<Transaction>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Transaction[]; total: number }>;

  /**
   * Actualiza el estado de una transacción
   */
  updateStatus(id: string, status: string, updates?: Record<string, any>): Promise<Transaction | null>;

  /**
   * Actualiza campos de la transacción
   */
  update(id: string, updates: Partial<Transaction>): Promise<Transaction | null>;

  /**
   * Obtiene transacciones próximas a expirar (status='new' y expiresAt <= ahora)
   */
  findExpired(): Promise<Transaction[]>;
}
