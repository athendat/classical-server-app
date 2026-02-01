import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TenantLifecycle,
  TenantLifecycleDocument,
} from '../schemas/tenant-lifecycle.schema';
import { TenantLifecycleEvent } from '../../domain/interfaces/lifecycle-event.interface';
import { createPaginationMeta } from 'src/common/helpers/build-pagination-meta';

/**
 * Repositorio de Ciclo de Vida de Tenants
 * Encapsula todas las operaciones de MongoDB para eventos de lifecycle
 */
@Injectable()
export class TenantLifecycleRepository {
  private readonly logger = new Logger(TenantLifecycleRepository.name);

  constructor(
    @InjectModel(TenantLifecycle.name)
    private readonly lifecycleModel: Model<TenantLifecycleDocument>,
  ) {}

  /**
   * Crear un nuevo evento de ciclo de vida
   */
  async create(event: TenantLifecycleEvent): Promise<TenantLifecycle> {
    try {
      const newEvent = new this.lifecycleModel(event);
      const savedEvent = await newEvent.save();
      return savedEvent.toObject() as TenantLifecycle;
    } catch (error) {
      this.logger.error('Error creating lifecycle event', error);
      throw error;
    }
  }

  /**
   * Listar eventos de ciclo de vida de un tenant específico con paginación
   */
  async findByTenantId(
    tenantId: string,
    pagination?: { page: number; limit: number },
  ): Promise<{
    data: TenantLifecycle[];
    total: number;
    meta: any;
  }> {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 20;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.lifecycleModel
          .find({ tenantId })
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.lifecycleModel.countDocuments({ tenantId }),
      ]);

      const meta = createPaginationMeta(total, page, limit);

      return {
        data: data as TenantLifecycle[],
        total,
        meta,
      };
    } catch (error) {
      this.logger.error(
        `Error finding lifecycle events for tenant: ${tenantId}`,
        error,
      );
      return {
        data: [],
        total: 0,
        meta: createPaginationMeta(0, 1, 20),
      };
    }
  }

  /**
   * Obtener el último evento de un tenant (para conocer el estado actual)
   */
  async getLastEvent(tenantId: string): Promise<TenantLifecycle | null> {
    try {
      const event = await this.lifecycleModel
        .findOne({ tenantId })
        .sort({ timestamp: -1 })
        .lean();
      return event as TenantLifecycle | null;
    } catch (error) {
      this.logger.error(
        `Error getting last lifecycle event for tenant: ${tenantId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Obtener todos los eventos de ciclo de vida (para auditoría)
   */
  async findAll(pagination?: { page: number; limit: number }): Promise<{
    data: TenantLifecycle[];
    total: number;
    meta: any;
  }> {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 20;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.lifecycleModel
          .find({})
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.lifecycleModel.countDocuments({}),
      ]);

      const meta = createPaginationMeta(total, page, limit);

      return {
        data: data as TenantLifecycle[],
        total,
        meta,
      };
    } catch (error) {
      this.logger.error('Error finding all lifecycle events', error);
      return {
        data: [],
        total: 0,
        meta: createPaginationMeta(0, 1, 20),
      };
    }
  }
}
