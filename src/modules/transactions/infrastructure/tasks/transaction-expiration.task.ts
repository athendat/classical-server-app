import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TransactionService } from '../../application/services/transaction.service';

/**
 * Tarea scheduled que ejecuta cada minuto
 * Busca transacciones expiradas (status='new' y expiresAt <= now)
 * y las marca como canceladas, emitiendo el evento correspondiente
 */
@Injectable()
export class TransactionExpirationTask {
  private readonly logger = new Logger(TransactionExpirationTask.name);

  constructor(private readonly transactionService: TransactionService) {}

  /**
   * Ejecuta cada minuto para limpiar transacciones expiradas
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireTransactions(): Promise<void> {
    try {
      this.logger.log('Iniciando tarea de expiración de transacciones');
      const count = await this.transactionService.expireTransactions();
      if (count > 0) {
        this.logger.log(`${count} transacciones fueron marcadas como expiradas`);
      }
    } catch (error: any) {
      this.logger.error(`Error en tarea de expiración: ${error.message}`);
      // No relanzar error, dejar que continúe ejecutándose
    }
  }
}
