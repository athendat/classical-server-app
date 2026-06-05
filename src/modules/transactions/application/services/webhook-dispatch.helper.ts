import { Webhook } from 'src/modules/tenants/domain';

/**
 * Decide si un webhook (objeto único por tenant) debe despacharse para un
 * evento dado. Defensa contra la forma del documento almacenado: `webhook` es
 * un sub-documento único (o null), NO un array — por eso aquí se lee como
 * objeto y nunca se llama `.filter`.
 */
export function isWebhookSubscribed(
  webhook: Webhook | null | undefined,
  eventType: string,
): boolean {
  return Boolean(
    webhook &&
      webhook.active === true &&
      typeof webhook.url === 'string' &&
      webhook.url.length > 0 &&
      Array.isArray(webhook.events) &&
      webhook.events.includes(eventType),
  );
}
