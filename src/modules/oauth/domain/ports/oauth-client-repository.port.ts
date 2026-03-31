export interface OAuthClientEntity {
  clientId: string;
  clientSecretHash: string;
  merchantId: string;
  terminalName: string;
  scopes: string[];
  isActive: boolean;
  revokedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IOAuthClientRepository {
  create(client: Omit<OAuthClientEntity, 'createdAt' | 'updatedAt'>): Promise<OAuthClientEntity>;
  findByClientId(clientId: string): Promise<OAuthClientEntity | null>;
  findByMerchantId(merchantId: string): Promise<OAuthClientEntity[]>;
  update(clientId: string, data: Partial<OAuthClientEntity>): Promise<OAuthClientEntity | null>;
}
