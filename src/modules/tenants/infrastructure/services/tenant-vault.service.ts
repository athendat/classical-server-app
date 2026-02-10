import { Injectable, Logger, Inject } from '@nestjs/common';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import type { IVaultClient } from 'src/modules/vault/domain/ports/vault-client.port';
import { Result } from 'src/common/types/result.type';

/**
 * Servicio para gestionar datos sensibles de tenants en Vault
 * Específicamente para almacenar, recuperar y enmascarar números de tarjetas (PAN)
 */
@Injectable()
export class TenantVaultService {
  private readonly logger = new Logger(TenantVaultService.name);

  constructor(
    @Inject(INJECTION_TOKENS.VAULT_CLIENT)
    private readonly vaultClient: IVaultClient,
  ) {}

  /**
   * Guardar un PAN (Primary Account Number) en Vault
   * @param tenantId - ID del tenant
   * @param pan - Número de tarjeta (con o sin espacios/guiones)
   * @returns Resultado con la clave de Vault creada
   */
  async savePan(tenantId: string, pan: string): Promise<Result<string>> {
    try {
      // Limpiar espacios y guiones
      const cleanPan = pan.replace(/[\s-]/g, '');

      // Validar que sea numérico
      if (!/^\d{13,19}$/.test(cleanPan)) {
        return Result.fail(new Error('PAN format invalid'));
      }

      // Crear clave de Vault
      const vaultKeyId = `tenants/${tenantId}/pan`;

      // Guardar en Vault
      const writeResult = await this.vaultClient.writeKV(vaultKeyId, {
        pan: cleanPan,
        savedAt: new Date().toISOString(),
        last4: cleanPan.slice(-4),
      });

      if (!writeResult.isSuccess) {
        return Result.fail(writeResult.getError());
      }

      this.logger.log(`PAN saved for tenant: ${tenantId}`);
      return Result.ok(vaultKeyId);
    } catch (error: any) {
      this.logger.error(`Error saving PAN for tenant ${tenantId}:`, error);
      return Result.fail(error as Error);
    }
  }

  /**
   * Recuperar un PAN del Vault
   * NOTA: Solo debe usarse internamente, nunca exponer directamente al cliente
   * @param tenantId - ID del tenant
   * @returns Resultado con el PAN desenmascarado
   */
  async getPan(tenantId: string): Promise<Result<string>> {
    try {
      const vaultKeyId = `tenants/${tenantId}/pan`;

      const readResult = await this.vaultClient.readKV(vaultKeyId);
      
      if (!readResult.isSuccess) {
        return Result.fail(readResult.getError());
      }
      
      const vaultData = readResult.getValue();
      const panData = vaultData.data as any;

      if (!panData?.data) {
        return Result.fail(new Error('PAN not found in Vault'));
      }

      this.logger.log(`PAN retrieved for tenant: ${tenantId}`);
      return Result.ok(panData.data.pan as string);
    } catch (error: any) {
      this.logger.error(`Error retrieving PAN for tenant ${tenantId}:`, error);
      return Result.fail(error as Error);
    }
  }

  /**
   * Eliminar un PAN del Vault
   * @param tenantId - ID del tenant
   * @returns Resultado de la operación
   */
  async deletePan(tenantId: string): Promise<Result<void>> {
    try {
      const vaultKeyId = `tenants/${tenantId}/pan`;

      const deleteResult = await this.vaultClient.deleteKV(vaultKeyId);

      if (!deleteResult.isSuccess) {
        return Result.fail(deleteResult.getError());
      }

      this.logger.log(`PAN deleted for tenant: ${tenantId}`);
      return Result.ok();
    } catch (error: any) {
      this.logger.error(`Error deleting PAN for tenant ${tenantId}:`, error);
      return Result.fail(error as Error);
    }
  }

  /**
   * Enmascarar un PAN mostrando solo los últimos 4 dígitos
   * Formato: ****-****-****-XXXX
   * @param pan - PAN completo
   * @returns PAN enmascarado
   */
  maskPan(pan: string): string {
    if (!pan || pan.length < 4) {
      return '**** **** **** ****';
    }

    const last4 = pan.slice(-4);
    return `**** **** **** ${last4}`;
  }

  /**
   * Obtener últimos 4 dígitos de un PAN
   * Usado para mostrar información de verificación
   * @param pan - PAN completo
   * @returns Últimos 4 dígitos
   */
  getLast4Digits(pan: string): string {
    if (!pan || pan.length < 4) {
      return '****';
    }
    return pan.slice(-4);
  }

  /**
   * Verificar si un PAN está almacenado en Vault
   * @param tenantId - ID del tenant
   * @returns true si existe el PAN, false en caso contrario
   */
  async existsPan(tenantId: string): Promise<boolean> {
    try {
      const result = await this.getPan(tenantId);
      return result.isSuccess;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Guardar el clientSecret del OAuth2 en Vault
   * @param tenantId - ID del tenant
   * @param clientSecret - Secret del cliente OAuth2
   * @returns Resultado con la clave de Vault creada
   */
  async saveOAuth2ClientSecret(
    tenantId: string,
    clientSecret: string,
  ): Promise<Result<string>> {
    try {
      // Validar que el clientSecret no esté vacío
      if (!clientSecret || clientSecret.trim().length === 0) {
        return Result.fail(new Error('OAuth2 client secret cannot be empty'));
      }

      // Crear clave de Vault
      const vaultKeyId = `tenants/${tenantId}/oauth2-secret`;

      // Guardar en Vault
      const writeResult = await this.vaultClient.writeKV(vaultKeyId, {
        clientSecret: clientSecret,
        savedAt: new Date().toISOString(),
        version: 1,
      });

      if (!writeResult.isSuccess) {
        return Result.fail(writeResult.getError());
      }

      this.logger.log(
        `OAuth2 client secret saved for tenant: ${tenantId}`,
      );
      return Result.ok(vaultKeyId);
    } catch (error: any) {
      this.logger.error(
        `Error saving OAuth2 client secret for tenant ${tenantId}:`,
        error,
      );
      return Result.fail(error as Error);
    }
  }

  /**
   * Leer el clientSecret del OAuth2 desde Vault
   * NOTA: Solo debe usarse internamente, nunca exponer directamente al cliente
   * @param tenantId - ID del tenant
   * @returns Resultado con el clientSecret
   */
  async getOAuth2ClientSecret(tenantId: string): Promise<Result<string>> {
    try {
      const vaultKeyId = `tenants/${tenantId}/oauth2-secret`;

      const readResult = await this.vaultClient.readKV(vaultKeyId);

      if (!readResult.isSuccess) {
        return Result.fail(readResult.getError());
      }

      const vaultData = readResult.getValue();
      const oauth2Data = vaultData.data as any;

      if (!oauth2Data?.data?.clientSecret) {
        return Result.fail(new Error('OAuth2 client secret not found in Vault'));
      }

      this.logger.log(
        `OAuth2 client secret retrieved for tenant: ${tenantId}`,
      );
      return Result.ok(oauth2Data.data.clientSecret as string);
    } catch (error: any) {
      this.logger.error(
        `Error retrieving OAuth2 client secret for tenant ${tenantId}:`,
        error,
      );
      return Result.fail(error as Error);
    }
  }

  /**
   * Rotar el clientSecret del OAuth2 (generar uno nuevo)
   * @param tenantId - ID del tenant
   * @param newClientSecret - Nuevo secret del cliente OAuth2
   * @returns Resultado con la versión actualizada
   */
  async rotateOAuth2ClientSecret(
    tenantId: string,
    newClientSecret: string,
  ): Promise<Result<{ version: number; rotatedAt: string }>> {
    try {
      // Validar que el nuevo clientSecret no esté vacío
      if (!newClientSecret || newClientSecret.trim().length === 0) {
        return Result.fail(new Error('New OAuth2 client secret cannot be empty'));
      }

      const vaultKeyId = `tenants/${tenantId}/oauth2-secret`;

      // Leer la versión anterior
      const currentResult = await this.vaultClient.readKV(vaultKeyId);
      let previousVersion = 1;

      if (currentResult.isSuccess) {
        const currentData = currentResult.getValue();
        const oauth2Data = currentData.data as any;
        previousVersion = (oauth2Data?.data?.version || 0) + 1;
      }

      // Guardar el nuevo secret con versión incrementada
      const rotatedAt = new Date().toISOString();
      const writeResult = await this.vaultClient.writeKV(vaultKeyId, {
        clientSecret: newClientSecret,
        version: previousVersion,
        rotatedAt,
        previousRotation: currentResult.isSuccess ? {} : undefined,
      });

      if (!writeResult.isSuccess) {
        return Result.fail(writeResult.getError());
      }

      this.logger.log(
        `OAuth2 client secret rotated for tenant: ${tenantId}, version: ${previousVersion}`,
      );
      return Result.ok({
        version: previousVersion,
        rotatedAt,
      });
    } catch (error: any) {
      this.logger.error(
        `Error rotating OAuth2 client secret for tenant ${tenantId}:`,
        error,
      );
      return Result.fail(error as Error);
    }
  }

  /**
   * Eliminar el clientSecret del OAuth2 desde Vault
   * @param tenantId - ID del tenant
   * @returns Resultado de la operación
   */
  async deleteOAuth2ClientSecret(tenantId: string): Promise<Result<void>> {
    try {
      const vaultKeyId = `tenants/${tenantId}/oauth2-secret`;

      const deleteResult = await this.vaultClient.deleteKV(vaultKeyId);

      if (!deleteResult.isSuccess) {
        return Result.fail(deleteResult.getError());
      }

      this.logger.log(
        `OAuth2 client secret deleted for tenant: ${tenantId}`,
      );
      return Result.ok();
    } catch (error: any) {
      this.logger.error(
        `Error deleting OAuth2 client secret for tenant ${tenantId}:`,
        error,
      );
      return Result.fail(error as Error);
    }
  }

  /**
   * Verificar si existe un clientSecret almacenado en Vault
   * @param tenantId - ID del tenant
   * @returns true si existe el clientSecret, false en caso contrario
   */
  async existsOAuth2ClientSecret(tenantId: string): Promise<boolean> {
    try {
      const result = await this.getOAuth2ClientSecret(tenantId);
      return result.isSuccess;
    } catch (error: any) {
      return false;
    }
  }
}
