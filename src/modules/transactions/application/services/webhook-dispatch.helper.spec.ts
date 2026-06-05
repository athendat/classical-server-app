import { isWebhookSubscribed } from './webhook-dispatch.helper';
import { Webhook } from 'src/modules/tenants/domain';

/**
 * Webhook activo y suscrito al evento, con URL configurada.
 */
function activeWebhook(overrides: Partial<Webhook> = {}): Webhook {
  return {
    id: 'wh-1',
    url: 'https://merchant.example.com/hook',
    events: ['transaction.processed', 'transaction.created'],
    active: true,
    secret: 'shhh',
    ...overrides,
  };
}

describe('isWebhookSubscribed', () => {
  it('returns false when webhook is null', () => {
    expect(isWebhookSubscribed(null, 'transaction.processed')).toBe(false);
  });

  it('returns false when webhook is undefined', () => {
    expect(isWebhookSubscribed(undefined, 'transaction.processed')).toBe(false);
  });

  it('returns false when webhook is inactive', () => {
    expect(
      isWebhookSubscribed(activeWebhook({ active: false }), 'transaction.processed'),
    ).toBe(false);
  });

  it('returns false when url is null (not yet configured)', () => {
    expect(
      isWebhookSubscribed(activeWebhook({ url: null }), 'transaction.processed'),
    ).toBe(false);
  });

  it('returns false when url is an empty string', () => {
    expect(
      isWebhookSubscribed(activeWebhook({ url: '' }), 'transaction.processed'),
    ).toBe(false);
  });

  it('returns false when not subscribed to the event', () => {
    expect(
      isWebhookSubscribed(activeWebhook({ events: ['transaction.created'] }), 'transaction.processed'),
    ).toBe(false);
  });

  it('returns false when events is empty', () => {
    expect(
      isWebhookSubscribed(activeWebhook({ events: [] }), 'transaction.processed'),
    ).toBe(false);
  });

  it('returns true when active, url configured, and subscribed to the event', () => {
    expect(isWebhookSubscribed(activeWebhook(), 'transaction.processed')).toBe(true);
  });

  // Regression for #23: the stored shape is a single object, not an array.
  // The helper must read it as an object and never throw "filter is not a function".
  it('handles a single-object webhook (not an array) without throwing', () => {
    const singleObject = activeWebhook();
    expect(() => isWebhookSubscribed(singleObject, 'transaction.processed')).not.toThrow();
    expect(isWebhookSubscribed(singleObject, 'transaction.processed')).toBe(true);
  });
});
