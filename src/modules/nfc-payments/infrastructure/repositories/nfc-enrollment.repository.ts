/**
 * Infrastructure Repository: NfcEnrollmentRepository
 *
 * Implementación Mongoose del puerto INfcEnrollmentRepository.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { INfcEnrollmentRepository, NfcEnrollmentEntity } from '../../domain/ports/nfc-enrollment-repository.port';
import { NfcEnrollment, NfcEnrollmentDocument } from '../schemas/nfc-enrollment.schema';

@Injectable()
export class NfcEnrollmentRepository implements INfcEnrollmentRepository {
  private readonly logger = new Logger(NfcEnrollmentRepository.name);

  constructor(
    @InjectModel(NfcEnrollment.name)
    private readonly model: Model<NfcEnrollmentDocument>,
  ) {}

  async findByCardId(cardId: string): Promise<NfcEnrollmentEntity | null> {
    const doc = await this.model.findOne({ cardId, status: 'active' }).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async create(enrollment: Partial<NfcEnrollmentEntity>): Promise<NfcEnrollmentEntity> {
    const created = await this.model.create(enrollment);
    return this.toEntity(created.toObject());
  }

  async update(cardId: string, data: Partial<NfcEnrollmentEntity>): Promise<NfcEnrollmentEntity | null> {
    const updated = await this.model
      .findOneAndUpdate({ cardId, status: 'active' }, { $set: data }, { new: true })
      .lean()
      .exec();
    if (!updated) return null;
    return this.toEntity(updated);
  }

  async incrementCounter(cardId: string): Promise<number> {
    const updated = await this.model
      .findOneAndUpdate(
        { cardId, status: 'active' },
        { $inc: { counter: 1 } },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new Error(`No active enrollment found for card ${cardId}`);
    }

    return updated.counter;
  }

  private toEntity(doc: any): NfcEnrollmentEntity {
    return {
      id: doc.id || doc._id?.toString(),
      cardId: doc.cardId,
      userId: doc.userId,
      devicePublicKey: doc.devicePublicKey,
      serverPublicKey: doc.serverPublicKey,
      vaultKeyPath: doc.vaultKeyPath,
      counter: doc.counter,
      status: doc.status,
      revokedAt: doc.revokedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
