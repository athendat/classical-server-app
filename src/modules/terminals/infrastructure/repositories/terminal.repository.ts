import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ITerminalRepository, TerminalEntity, TerminalFilters } from '../../domain/ports/terminal-repository.port';
import { Terminal, TerminalDocument } from '../schemas/terminal.schema';

@Injectable()
export class TerminalRepository implements ITerminalRepository {
  private readonly logger = new Logger(TerminalRepository.name);

  constructor(
    @InjectModel(Terminal.name)
    private readonly model: Model<TerminalDocument>,
  ) {}

  async create(terminal: Partial<TerminalEntity>): Promise<TerminalEntity> {
    const created = await this.model.create(terminal);
    return this.toEntity(created.toObject());
  }

  async findByTerminalId(terminalId: string): Promise<TerminalEntity | null> {
    const doc = await this.model.findOne({ terminalId }).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByTenantId(tenantId: string, filters?: TerminalFilters): Promise<TerminalEntity[]> {
    const query: Record<string, any> = { tenantId };
    if (filters?.type) query.type = filters.type;
    if (filters?.status) query.status = filters.status;
    if (filters?.capability) query.capabilities = { $in: [filters.capability] };

    const docs = await this.model.find(query).lean().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async findByOAuthClientId(clientId: string): Promise<TerminalEntity | null> {
    const doc = await this.model.findOne({ oauthClientId: clientId }).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findAll(
    filters?: TerminalFilters & { tenantId?: string },
    pagination?: { skip: number; limit: number },
  ): Promise<{ data: TerminalEntity[]; total: number }> {
    const query: Record<string, any> = {};
    if (filters?.tenantId) query.tenantId = filters.tenantId;
    if (filters?.type) query.type = filters.type;
    if (filters?.status) query.status = filters.status;
    if (filters?.capability) query.capabilities = { $in: [filters.capability] };

    if (!pagination) {
      const all = await this.model.find(query).lean().exec();
      return { data: all.map((doc) => this.toEntity(doc)), total: all.length };
    }

    const [docs, total] = await Promise.all([
      this.model.find(query).skip(pagination.skip).limit(pagination.limit).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return { data: docs.map((doc) => this.toEntity(doc)), total };
  }

  async update(terminalId: string, data: Partial<TerminalEntity>): Promise<TerminalEntity | null> {
    const updated = await this.model
      .findOneAndUpdate({ terminalId }, { $set: data }, { new: true })
      .lean()
      .exec();
    if (!updated) return null;
    return this.toEntity(updated);
  }

  private toEntity(doc: any): TerminalEntity {
    return {
      id: doc.id || doc._id?.toString(),
      terminalId: doc.terminalId,
      tenantId: doc.tenantId,
      name: doc.name,
      type: doc.type,
      capabilities: doc.capabilities,
      status: doc.status,
      location: doc.location,
      deviceSerial: doc.deviceSerial,
      deviceModel: doc.deviceModel,
      deviceManufacturer: doc.deviceManufacturer,
      oauthClientId: doc.oauthClientId,
      createdBy: doc.createdBy,
      revokedAt: doc.revokedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
