import { v4 as uuidv4 } from 'uuid';

export enum TransactionStatus {
  NEW = 'new', // icon: 'circle' color: '#FFC107' (amber)
  PROCESSING = 'processing', // icon: 'autorenew' color: '#2196F3' (blue)
  SUCCESS = 'success', // icon: 'check_circle' color: '#4CAF50' (green)
  FAILED = 'failed', // icon: 'error' color: '#F44336' (red)
  CANCELLED = 'cancelled', // icon: 'cancel' color: '#9E9E9E' (grey)
}

/**
 * Entidad: Transaction
 * Representa una transacción de pago en el sistema
 */
export class Transaction {
  id: string; // UUID único
  ref: string; // Referencia del cliente (orden)
  intentId: string; // UUID v4 para idempotencia (evitar duplicados)
  no: number; // Número secuencial universal
  tenantId: string; // Tenant propietario
  tenantName: string; // Nombre del tenant (para QR)
  customerId: string; // Cliente que inicia la transacción
  amount: number; // Monto en centavos
  status: TransactionStatus; // Estado actual
  cardId?: string; // Tarjeta usada para pagar (se agrega en confirmación)
  ttlMinutes: number; // Tiempo de vida en minutos (máximo 1440 = 24h)
  expiresAt: Date; // Timestamp de expiración
  signature: string; // Firma HMAC-SHA256 del payload del QR
  stateSnapshot?: Record<string, any>; // Snapshot de la máquina de estados XState
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<Transaction> = {}) {
    this.id = partial.id ?? uuidv4();
    this.ref = partial.ref ?? '';
    this.intentId = partial.intentId ?? uuidv4();
    this.no = partial.no ?? 0;
    this.tenantId = partial.tenantId ?? '';
    this.tenantName = partial.tenantName ?? '';
    this.customerId = partial.customerId ?? '';
    this.amount = partial.amount ?? 0;
    this.status = partial.status ?? TransactionStatus.NEW;
    this.cardId = partial.cardId;
    this.ttlMinutes = partial.ttlMinutes ?? 15; // Default 15 minutos
    this.expiresAt = partial.expiresAt ?? new Date();
    this.signature = partial.signature ?? '';
    this.stateSnapshot = partial.stateSnapshot;
    this.createdAt = partial.createdAt ?? new Date();
    this.updatedAt = partial.updatedAt ?? new Date();
  }

  /**
   * Retorna el payload que se incluye en el QR (antes de firmar)
   */
  getQrPayload(): Record<string, any> {
    return {
      id: this.id,
      ref: this.ref,
      no: this.no,
      tenantName: this.tenantName,
      amount: this.amount,
      expiresAt: this.expiresAt.toISOString(),
    };
  }

  /**
   * Marca la transacción como expirada
   */
  markAsExpired(): void {
    this.status = TransactionStatus.CANCELLED;
    this.updatedAt = new Date();
  }

  /**
   * Transiciona la transacción a processing (confirmada por cliente)
   */
  markAsProcessing(cardId: string): void {
    this.status = TransactionStatus.PROCESSING;
    this.cardId = cardId;
    this.updatedAt = new Date();
  }

  /**
   * Verifica si la transacción está expirada
   */
  isExpired(): boolean {
    return this.status === TransactionStatus.NEW && new Date() > this.expiresAt;
  }

  /**
   * Verifica si la transacción está en estado final
   */
  isFinal(): boolean {
    return [TransactionStatus.SUCCESS, TransactionStatus.FAILED, TransactionStatus.CANCELLED].includes(
      this.status,
    );
  }
}
