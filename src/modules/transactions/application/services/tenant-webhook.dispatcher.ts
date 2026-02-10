import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { HttpService } from '../../../../common/http/http.service';
import { CryptoService } from '../../../../common/crypto/crypto.service';

import {
  TransactionCreatedEvent,
  TransactionConfirmedEvent,
  TransactionProcessedEvent,
  TransactionExpiredEvent,
  TransactionCancelledEvent,
} from '../../domain/events/transaction.events';
import { Tenant } from 'src/modules/tenants/infrastructure/schemas/tenant.schema';

/**
 * Servicio que despacha webhook cuando ocurren eventos de transacción
 * Implementa listeners para cada tipo de evento
 * Firma los payloads con HMAC-SHA256 y los envía a las URLs configuradas
 */
@Injectable()
export class TenantWebhookDispatcher {
  private readonly logger = new Logger(TenantWebhookDispatcher.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly cryptoService: CryptoService,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<Tenant>,
  ) {}

  /**
   * Listener para evento de transacción creada
   */
  @OnEvent('transaction.created')
  async handleTransactionCreated(event: TransactionCreatedEvent): Promise<void> {
    await this.dispatchWebhook(event.tenantId, 'transaction.created', {
      transactionId: event.transactionId,
      customerId: event.customerId,
      ref: event.ref,
      no: event.no,
      amount: event.amount,
      expiresAt: event.expiresAt,
      timestamp: new Date().toISOString(),
    }).catch((error) => {
      this.logger.warn(
        `Error despachando webhook para transaction.created: ${error.message}`,
      );
    });
  }

  /**
   * Listener para evento de transacción confirmada
   */
  @OnEvent('transaction.confirmed')
  async handleTransactionConfirmed(event: TransactionConfirmedEvent): Promise<void> {
    await this.dispatchWebhook(event.tenantId, 'transaction.confirmed', {
      transactionId: event.transactionId,
      customerId: event.customerId,
      cardId: event.cardId,
      timestamp: new Date().toISOString(),
    }).catch((error) => {
      this.logger.warn(
        `Error despachando webhook para transaction.confirmed: ${error.message}`,
      );
    });
  }

  /**
   * Listener para evento de transacción procesada
   */
  @OnEvent('transaction.processed')
  async handleTransactionProcessed(event: TransactionProcessedEvent): Promise<void> {
    await this.dispatchWebhook(event.tenantId, 'transaction.processed', {
      transactionId: event.transactionId,
      status: event.status,
      error: event.error,
      timestamp: new Date().toISOString(),
    }).catch((error) => {
      this.logger.warn(
        `Error despachando webhook para transaction.processed: ${error.message}`,
      );
    });
  }

  /**
   * Listener para evento de transacción expirada
   */
  @OnEvent('transaction.expired')
  async handleTransactionExpired(event: TransactionExpiredEvent): Promise<void> {
    await this.dispatchWebhook(event.tenantId, 'transaction.expired', {
      transactionId: event.transactionId,
      timestamp: new Date().toISOString(),
    }).catch((error) => {
      this.logger.warn(
        `Error despachando webhook para transaction.expired: ${error.message}`,
      );
    });
  }

  /**
   * Listener para evento de transacción cancelada
   */
  @OnEvent('transaction.cancelled')
  async handleTransactionCancelled(event: TransactionCancelledEvent): Promise<void> {
    await this.dispatchWebhook(event.tenantId, 'transaction.cancelled', {
      transactionId: event.transactionId,
      timestamp: new Date().toISOString(),
    }).catch((error) => {
      this.logger.warn(
        `Error despachando webhook para transaction.cancelled: ${error.message}`,
      );
    });
  }

  /**
   * Despacha webhook a todas las URLs configuradas para un evento específico
   * Fire-and-forget: no bloquea la operación original
   *
   * @param tenantId ID del tenant propietario de la transacción
   * @param eventType Tipo de evento (ej: 'transaction.created')
   * @param payload Datos a enviar en el webhook
   */
  private async dispatchWebhook(
    tenantId: string,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<void> {
    try {
      // Obtener configuración de webhook del tenant
      const tenant = await this.tenantModel.findOne({ id: tenantId }).exec();
      if (!tenant || !tenant.webhook) {
        this.logger.log(`Ningún webhook configurado para tenant ${tenantId}`);
        return;
      }

      // Filtrar webhook activos que están suscritos a este evento
      const activeWebhook = (tenant.webhook as any).filter(
        (webhook) => webhook.active && webhook.events.includes(eventType),
      );

      if (activeWebhook.length === 0) {
        this.logger.log(
          `Ningún webhook activo para evento ${eventType} en tenant ${tenantId}`,
        );
        return;
      }

      // Despachar a cada webhook
      for (const webhook of activeWebhook) {
        this.sendWebhook(webhook, eventType, payload).catch((error) => {
          this.logger.error(
            `Error enviando webhook a ${webhook.url}: ${error.message}`,
          );
        });
      }
    } catch (error: any) {
      this.logger.error(`Error despachando webhook para tenant ${tenantId}: ${error.message}`);
    }
  }

  /**
   * Envía un webhook individual
   *
   * @param webhook Configuración del webhook
   * @param eventType Tipo de evento
   * @param payload Datos a enviar
   */
  private async sendWebhook(
    webhook: any,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<void> {
    try {
      // Construir payload con metadatos
      const fullPayload = {
        event: eventType,
        data: payload,
        sentAt: new Date().toISOString(),
      };

      // Crear firma HMAC del payload
      const payloadString = JSON.stringify(fullPayload);
      const signature = this.cryptoService.createSignature(payloadString, webhook.secret);

      this.logger.log(`Enviando webhook a ${webhook.url} con evento ${eventType}`);

      // Enviar POST con firma en header
      await this.httpService.post(webhook.url, fullPayload, {
        headers: {
          'X-Webhook-Signature': signature,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 segundos timeout
      });

      this.logger.log(`Webhook enviado exitosamente a ${webhook.url}`);
    } catch (error: any) {
      this.logger.error(
        `Error enviando webhook a ${webhook.url}: ${error.message}`,
      );
      throw error;
    }
  }
}
