/**
 * Subdocumento para configuración de webhooks
 * Almacena URLs y secrets para notificaciones de eventos
 */
/**
 * Configuración de un webhook.
 *
 * Representa la configuración necesaria para registrar y enviar notificaciones vía webhook.
 *
 * @remarks
 * El campo `secret` se utiliza para firmar los payloads (HMAC-SHA256) y verificar la integridad del mensaje.
 *
 * @example Ejemplo de uso
 * const cfg: WebhookConfig = {
 *   id: 'uuid-v4',
 *   url: 'https://example.com/webhook',
 *   events: ['transaction.created', 'transaction.confirmed'],
 *   secret: 'mi-secreto',
 * };
 *
 * @property {string} id UUID único por webhook.
 * @property {string} url URL donde se enviarán los webhooks.
 * @property {string[]} events Eventos a los que suscribirse (ej.: 'transaction.created', 'transaction.confirmed').
 * @property {string} secret Secret para firmar webhooks (HMAC-SHA256).
 */
export class Webhook {
    id: string; // UUID único por webhook
    url?: string | null; // URL donde se enviarán los webhooks (opcional inicialmente, null por defecto)
    events: string[]; // Eventos a los que suscribirse (ej: 'transaction.created', 'transaction.confirmed')
    secret: string; // Secret para firmar webhooks (HMAC-SHA256)
}