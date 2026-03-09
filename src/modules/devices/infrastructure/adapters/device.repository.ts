/**
 * Infrastructure Adapter: DeviceRepository
 * 
 * Implementación de persistencia de dispositivos usando MongoDB y Mongoose.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DeviceKey, DeviceKeyDocument } from '../schemas/device-key.schema';
import { IDeviceRepository } from '../../domain/ports/device-repository.port';
import type { IDeviceKey } from '../../domain/models/device-key.model';
import { DeviceKeyStatus } from '../../domain/models/device-key.model';
import { PaginationMeta } from 'src/common/types';
import { createPaginationMeta } from 'src/common/helpers';

@Injectable()
export class DeviceRepository implements IDeviceRepository {
  private readonly logger = new Logger(DeviceRepository.name);

  constructor(@InjectModel(DeviceKey.name) private readonly model: Model<DeviceKeyDocument>) {}

  async findByDeviceId(deviceId: string): Promise<IDeviceKey | null> {
    const document = await this.model
      .findOne({
        deviceId,
        // status: DeviceKeyStatus.ACTIVE,
      })
      .lean();

    return document ? this.mapToModel(document) : null;
  }

  async findByKeyHandle(keyHandle: string): Promise<IDeviceKey | null> {
    const document = await this.model.findOne({ keyHandle }).lean();

    return document ? this.mapToModel(document) : null;
  }

  async findActiveByUserId(userId: string): Promise<IDeviceKey[]> {
    const documents = await this.model
      .find({
        userId,
        status: DeviceKeyStatus.ACTIVE,
      })
      .lean();

    return documents.map(d => this.mapToModel(d));
  }

  async create(
    deviceKey: Omit<IDeviceKey, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<IDeviceKey> {
    try {
      const created = await this.model.create(deviceKey);

      this.logger.log(
        `Created device key | deviceId: ${deviceKey.deviceId} | keyHandle: ${deviceKey.keyHandle}`,
      );

      return this.mapToModel(created.toObject());
    } catch (error: any) {
      this.logger.error(`Failed to create device key: ${error.message}`);
      throw error;
    }
  }

  async update(
    id: string,
    partial: Partial<Omit<IDeviceKey, 'id' | 'createdAt'>>,
  ): Promise<IDeviceKey> {
    const updated = await this.model.findOneAndUpdate({ id }, partial, {
      new: true,
      lean: true,
    });

    if (!updated) {
      throw new Error(`Device key not found: ${id}`);
    }

    this.logger.log(`Updated device key | id: ${id}`);

    return this.mapToModel(updated);
  }

  async updateStatus(id: string, status: string): Promise<IDeviceKey> {
    return this.update(id, { status: status as DeviceKeyStatus });
  }

  async countActiveDevicesByUserId(userId: string): Promise<number> {
    return this.model.countDocuments({
      userId,
      status: DeviceKeyStatus.ACTIVE,
    });
  }

  async findExpiredKeys(expirationThresholdDays: number): Promise<IDeviceKey[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + expirationThresholdDays);

    const documents = await this.model
      .find({
        expiresAt: { $lte: thresholdDate },
        status: DeviceKeyStatus.ACTIVE,
      })
      .lean();

    return documents.map(d => this.mapToModel(d));
  }

  async findDeviceHistory(
    deviceId: string,
    userId: string,
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ data: IDeviceKey[]; meta: PaginationMeta }> {
    const [data, total] = await Promise.all([
      this.model
        .find({ deviceId, userId })
        .sort({ createdAt: -1 })
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

  async exists(deviceId: string, userId: string): Promise<boolean> {
    const count = await this.model.countDocuments({ deviceId, userId });
    return count > 0;
  }

  async revokeAllByUserId(userId: string, reason: string): Promise<number> {
    const result = await this.model.updateMany(
      { userId, status: DeviceKeyStatus.ACTIVE },
      { status: DeviceKeyStatus.REVOKED },
    );

    this.logger.log(`Revoked all devices for user | userId: ${userId} | count: ${result.modifiedCount}`);

    return result.modifiedCount;
  }

  private mapToModel(doc: any): IDeviceKey {
    return {
      id: doc.id,
      deviceId: doc.deviceId,
      userId: doc.userId,
      keyHandle: doc.keyHandle,
      devicePublicKey: doc.devicePublicKey,
      serverPublicKey: doc.serverPublicKey,
      saltHex: doc.saltHex,
      status: doc.status,
      issuedAt: new Date(doc.issuedAt),
      expiresAt: new Date(doc.expiresAt),
      platform: doc.platform,
      appVersion: doc.appVersion,
      createdAt: doc.createdAt ? new Date(doc.createdAt) : undefined,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : undefined,
    };
  }
}
