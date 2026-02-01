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

      this.logger.debug(`PAN saved for tenant: ${tenantId}`);
      return Result.ok(vaultKeyId);
    } catch (error) {
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

      if (!panData?.pan) {
        return Result.fail(new Error('PAN not found in Vault'));
      }

      this.logger.debug(`PAN retrieved for tenant: ${tenantId}`);
      return Result.ok(panData.pan as string);
    } catch (error) {
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

      this.logger.debug(`PAN deleted for tenant: ${tenantId}`);
      return Result.ok();
    } catch (error) {
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
    } catch (error) {
      return false;
    }
  }
}
