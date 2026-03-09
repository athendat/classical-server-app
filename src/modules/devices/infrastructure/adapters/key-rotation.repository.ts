/**
 * Infrastructure Adapter: KeyRotationRepository
 * 
 * Implementación de auditoría de rotaciones de claves.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KeyRotationHistory, KeyRotationHistoryDocument } from '../schemas/key-rotation-history.schema';
import { IKeyRotationPort } from '../../domain/ports/key-rotation.port';
import type { IKeyRotationRecord } from '../../domain/models/key-rotation.model';
import { PaginationMeta } from 'src/common/types';
import { createPaginationMeta } from 'src/common/helpers';

@Injectable()
export class KeyRotationRepository implements IKeyRotationPort {
  private readonly logger = new Logger(KeyRotationRepository.name);

  constructor(
    @InjectModel(KeyRotationHistory.name)
    private readonly model: Model<KeyRotationHistoryDocument>,
  ) {}

  async recordRotation(
    record: Omit<IKeyRotationRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<IKeyRotationRecord> {

    try {
      const created = await this.model.create(record);

      this.logger.log(
        `Recorded key rotation | deviceId: ${record.deviceId} | reason: ${record.reason}`,
      );

      return this.mapToModel(created.toObject());
    } catch (error: any) {
      this.logger.error(`Failed to record rotation: ${error.message}`);
      throw error;
    }
  }

  async getHistoryByDeviceId(
    deviceId: string,
    userId: string,
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ data: IKeyRotationRecord[]; meta: PaginationMeta }> {
    const [data, total] = await Promise.all([
      this.model
        .find({ deviceId, userId })
        .sort({ rotatedAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean(),
      this.model.countDocuments({ deviceId, userId }),
    ]);

    const page = Math.floor(offset / limit) + 1;
    const meta = createPaginationMeta(total, page, limit);

    return {
      data: data.map(d => this.mapToModel(d)),
      meta,
    };
  }

  async getLastRotation(deviceId: string): Promise<IKeyRotationRecord | null> {
    const document = await this.model
      .findOne({ deviceId })
      .sort({ rotatedAt: -1 })
      .lean();

    return document ? this.mapToModel(document) : null;
  }

  async countRotationsIn24Hours(deviceId: string): Promise<number> {
    const last24hours = new Date();
    last24hours.setHours(last24hours.getHours() - 24);

    return this.model.countDocuments({
      deviceId,
      rotatedAt: { $gte: last24hours },
    });
  }

  async findByUserId(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<IKeyRotationRecord[]> {
    const query: any = { userId };

    if (startDate || endDate) {
      query.rotatedAt = {};
      if (startDate) query.rotatedAt.$gte = startDate;
      if (endDate) query.rotatedAt.$lte = endDate;
    }

    const documents = await this.model.find(query).sort({ rotatedAt: -1 }).lean();

    return documents.map(d => this.mapToModel(d));
  }

  private mapToModel(doc: any): IKeyRotationRecord {
    return {
      id: doc.id,
      deviceId: doc.deviceId,
      userId: doc.userId,
      previousKeyHandle: doc.previousKeyHandle,
      newKeyHandle: doc.newKeyHandle,
      reason: doc.reason,
      initiatedBy: doc.initiatedBy,
      rotatedAt: new Date(doc.rotatedAt),
      createdAt: doc.createdAt ? new Date(doc.createdAt) : undefined,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : undefined,
    };
  }
}
