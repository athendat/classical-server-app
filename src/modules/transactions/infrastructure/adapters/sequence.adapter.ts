import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ISequencePort } from '../../domain/ports/sequence.port';
import { TransactionSequence } from '../schemas/transaction-sequence.schema';

/**
 * Adapter: Implementación de secuencia universal con MongoDB
 * Usa operación atómica findByIdAndUpdate para garantizar incremento seguro
 */
@Injectable()
export class MongoDbSequenceAdapter implements ISequencePort {
  private readonly logger = new Logger(MongoDbSequenceAdapter.name);

  constructor(
    @InjectModel(TransactionSequence.name)
    private readonly sequenceModel: Model<TransactionSequence>,
  ) {}

  /**
   * Obtiene el próximo número secuencial universal para transacciones
   * Operación atómica: garantiza que no hay duplicados incluso con concurrencia
   * @returns Próximo número de transacción
   * @throws Si hay error en la BD
   */
  async getNextTransactionNo(): Promise<number> {
    try {
      const result = await this.sequenceModel.findOneAndUpdate(
        { collectionName: 'transactions' },
        { $inc: { nextNo: 1 } },
        {
          new: true,
          upsert: true, // Crea el documento si no existe (inicializa en 1)
        },
      );

      return result.nextNo;
    } catch (error: any) {
      this.logger.error(`Error obteniendo próximo número de transacción: ${error.message}`);
      throw error;
    }
  }
}
