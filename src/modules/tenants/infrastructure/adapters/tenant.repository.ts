import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { ITenantPort } from '../../domain/ports/tenant.port';
import { TenantStatus } from '../../domain/enums';
import { Tenant, TenantDocument } from '../schemas/tenant.schema';

/**
 * Repositorio de Tenants implementando el puerto ITenantPort
 * Encapsula todas las operaciones de MongoDB para tenants
 */
@Injectable()
export class TenantsRepository implements ITenantPort {
  private readonly logger = new Logger(TenantsRepository.name);

  constructor(
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
  ) { }

  /**
   * Buscar un tenant por su ID
   */
  async findById(tenantId: string): Promise<Tenant | null> {
    try {
      const tenant = await this.tenantModel.findOne({ id: tenantId }).lean();
      return tenant as Tenant | null;
    } catch (error: any) {
      this.logger.error(`Error finding tenant by id: ${tenantId}`, error);
      return null;
    }
  }

  /**
   * Buscar un tenant por email
   */
  async findByEmail(email: string): Promise<Tenant | null> {
    try {
      const tenant = await this.tenantModel
        .findOne({ email: email.toLowerCase() })
        .lean();
      return tenant as Tenant | null;
    } catch (error: any) {
      this.logger.error(`Error finding tenant by email: ${email}`, error);
      return null;
    }
  }

  /**
   * Buscar un tenant por userId
   */
  async findByUserId(userId: string): Promise<Tenant | null> {
    try {
      const tenant = await this.tenantModel
        .findOne({ userId })
        .lean();
      return tenant as Tenant | null;
    } catch (error: any) {
      this.logger.error(`Error finding tenant by userId: ${userId}`, error);
      return null;
    }
  }

  /**
   * Listar tenants con filtros y paginación
   */
  async findAll(
    filter: QueryFilter<Tenant>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Tenant[]; total: number }> {
    try {
      this.logger.log(
        `Finding Tenants with filter: ${JSON.stringify(filter)}, skip=${options.skip}, limit=${options.limit}`,
      );

      // Ejecutar query en paralelo: obtener documentos y contar total
      const [tenants, total] = await Promise.all([
        this.tenantModel
          .find(filter as any)
          .sort((options.sort || { createdAt: -1 }) as any)
          .skip(options.skip)
          .limit(options.limit)
          .lean()
          .exec(),
        this.tenantModel.countDocuments(filter as any).exec(),
      ]);

      this.logger.log(
        `Found ${tenants.length} Tenants (total: ${total}, skip: ${options.skip}, limit: ${options.limit})`,
      );

      return {
        data: tenants as Tenant[],
        total,
      };
    } catch (error: any) {
      this.logger.error(
        `Error finding Tenants with filter: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new Error(
        `Find with filter failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }


  /**
   * Obtener usuarios por una lista de IDs.
   * @param ids 
   * @returns 
   */
  async findByIds(ids: string[]): Promise<Tenant[]> {
    return this.tenantModel
      .find({ id: { $in: ids }, })
      .select(
        {
          _id: 0,
          id: 1,
          businessName: 1,
        },
      )
      .lean()
      .exec();
  }

  /**
   * Crear un nuevo tenant
   */
  async create(tenantData: Partial<Tenant>): Promise<Tenant> {
    try {
      const newTenant = new this.tenantModel(tenantData);
      const savedTenant = await newTenant.save();
      return savedTenant.toObject() as Tenant;
    } catch (error: any) {
      this.logger.error('Error creating tenant', error);
      throw error;
    }
  }

  /**
   * Actualizar un tenant existente
   */
  async update(tenantId: string, updates: Partial<Tenant>): Promise<Tenant> {
    try {
      const updated = await this.tenantModel
        .findOneAndUpdate(
          { id: tenantId },
          { ...updates, updatedAt: new Date() },
          { new: true },
        )
        .lean();
      if (!updated) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      return updated as Tenant;
    } catch (error: any) {
      this.logger.error(`Error updating tenant: ${tenantId}`, error);
      throw error;
    }
  }

  /**
   * Cambiar el estado de un tenant
   */
  async updateStatus(tenantId: string, status: TenantStatus): Promise<Tenant> {
    try {
      const updated = await this.tenantModel
        .findOneAndUpdate(
          { id: tenantId },
          { status, updatedAt: new Date() },
          { new: true },
        )
        .lean();
      if (!updated) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      return updated as Tenant;
    } catch (error: any) {
      this.logger.error(
        `Error updating tenant status: ${tenantId} to ${status}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Actualizar las credenciales OAuth2 de un tenant
   * @param tenantId ID del tenant
   * @param clientId Nuevo clientId
   * @param clientSecret Nuevo clientSecret (se ignora - el secret se guarda en Vault)
   * 
   * Nota: El clientSecret se guarda en Vault, no en la BD
   */
  async updateOAuth2Credentials(
    tenantId: string,
    clientId: string,
    clientSecret: string,
  ): Promise<Tenant> {
    try {
      // Solo guardar clientId en BD, el clientSecret va al Vault
      const updated = await this.tenantModel
        .findOneAndUpdate(
          { id: tenantId },
          { oauth2ClientCredentials: { clientId }, updatedAt: new Date() },
          { new: true },
        )
        .lean();
      if (!updated) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      return updated as Tenant;
    } catch (error: any) {
      this.logger.error(
        `Error updating OAuth2 credentials for tenant: ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Actualizar el secret del webhook de un tenant
   * @param tenantId 
   * @param secret 
   * @returns 
   */
  async updateWebhookSecret(
    tenantId: string,
    secret: string,
  ): Promise<Tenant> {
    try {
      const updated = await this.tenantModel
        .findOneAndUpdate(
          { id: tenantId },
          { webhook: { secret }, updatedAt: new Date() },
          { new: true },
        )
        .lean();
      if (!updated) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      return updated as Tenant;
    } catch (error: any) {
      this.logger.error(
        `Error updating webhook secret for tenant: ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Actualizar la URL del webhook de un tenant
   * @param tenantId ID del tenant
   * @param url Nueva URL del webhook
   * @returns Tenant actualizado
   */
  async updateWebhookUrl(tenantId: string, url: string): Promise<Tenant> {
    try {
      const updated = await this.tenantModel
        .findOneAndUpdate(
          { id: tenantId },
          { 'webhook.url': url, updatedAt: new Date() },
          { new: true },
        )
        .lean();
      if (!updated) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      return updated as Tenant;
    } catch (error: any) {
      this.logger.error(
        `Error updating webhook URL for tenant: ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Eliminar un tenant (soft delete si aplica)
   */
  async delete(tenantId: string): Promise<void> {
    try {
      await this.tenantModel.deleteOne({ id: tenantId });
    } catch (error: any) {
      this.logger.error(`Error deleting tenant: ${tenantId}`, error);
      throw error;
    }
  }
}
