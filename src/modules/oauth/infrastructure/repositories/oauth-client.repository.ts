import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { IOAuthClientRepository, OAuthClientEntity } from '../../domain/ports/oauth-client-repository.port';
import { OAuthClient, OAuthClientDocument } from '../schemas/oauth-client.schema';

@Injectable()
export class OAuthClientRepository implements IOAuthClientRepository {
  constructor(
    @InjectModel(OAuthClient.name)
    private readonly oauthClientModel: Model<OAuthClientDocument>,
  ) {}

  async create(
    client: Omit<OAuthClientEntity, 'createdAt' | 'updatedAt'>,
  ): Promise<OAuthClientEntity> {
    const created = await this.oauthClientModel.create(client);
    return this.toEntity(created);
  }

  async findByClientId(clientId: string): Promise<OAuthClientEntity | null> {
    const doc = await this.oauthClientModel.findOne({ clientId }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByMerchantId(merchantId: string): Promise<OAuthClientEntity[]> {
    const docs = await this.oauthClientModel.find({ merchantId }).exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async update(
    clientId: string,
    data: Partial<OAuthClientEntity>,
  ): Promise<OAuthClientEntity | null> {
    const doc = await this.oauthClientModel
      .findOneAndUpdate({ clientId }, { $set: data }, { new: true })
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: OAuthClientDocument): OAuthClientEntity {
    return {
      clientId: doc.clientId,
      clientSecretHash: doc.clientSecretHash,
      merchantId: doc.merchantId,
      terminalName: doc.terminalName,
      scopes: doc.scopes,
      isActive: doc.isActive,
      revokedAt: doc.revokedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
