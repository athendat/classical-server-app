import { Logger } from '@nestjs/common';

import { TenantWebhookDispatcher } from './tenant-webhook.dispatcher';
import { TransactionProcessedEvent } from '../../domain/events/transaction.events';
import { Webhook } from 'src/modules/tenants/domain';

/**
 * Regression coverage for #23: the stored `tenant.webhook` is a single
 * sub-document (object) or null — never an array. The dispatcher must read it
 * as an object and actually POST when it is active + subscribed, instead of
 * crashing with "tenant.webhook.filter is not a function".
 */
describe('TenantWebhookDispatcher', () => {
  let dispatcher: TenantWebhookDispatcher;
  let httpService: { post: jest.Mock };
  let cryptoService: { createSignature: jest.Mock };
  let tenantModel: { findOne: jest.Mock };

  function mockTenant(webhook: Webhook | null) {
    tenantModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(webhook ? { id: 'tenant-1', webhook } : { id: 'tenant-1', webhook: null }),
    });
  }

  function activeWebhook(overrides: Partial<Webhook> = {}): Webhook {
    return {
      id: 'wh-1',
      url: 'https://merchant.example.com/hook',
      events: ['transaction.processed'],
      active: true,
      secret: 'shhh',
      ...overrides,
    };
  }

  const event = new TransactionProcessedEvent('tx-1', 'tenant-1', 'success');

  beforeEach(() => {
    httpService = { post: jest.fn().mockResolvedValue(undefined) };
    cryptoService = { createSignature: jest.fn().mockReturnValue('sig') };
    tenantModel = { findOne: jest.fn() };

    dispatcher = new TenantWebhookDispatcher(
      httpService as any,
      cryptoService as any,
      tenantModel as any,
    );

    // Keep test output pristine.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('POSTs the webhook when the (single-object) webhook is active and subscribed', async () => {
    mockTenant(activeWebhook());

    await dispatcher.handleTransactionProcessed(event);

    expect(httpService.post).toHaveBeenCalledTimes(1);
    expect(httpService.post).toHaveBeenCalledWith(
      'https://merchant.example.com/hook',
      expect.objectContaining({ event: 'transaction.processed' }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Webhook-Signature': 'sig' }),
      }),
    );
  });

  it('does not throw "filter is not a function" for the single-object shape', async () => {
    mockTenant(activeWebhook());

    await expect(dispatcher.handleTransactionProcessed(event)).resolves.toBeUndefined();
    const errorCalls = (Logger.prototype.error as jest.Mock).mock.calls.flat().join(' ');
    expect(errorCalls).not.toContain('is not a function');
  });

  it('does not POST when the tenant has no webhook configured', async () => {
    mockTenant(null);

    await dispatcher.handleTransactionProcessed(event);

    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('does not POST when the webhook is inactive', async () => {
    mockTenant(activeWebhook({ active: false }));

    await dispatcher.handleTransactionProcessed(event);

    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('does not POST when the webhook is not subscribed to the event', async () => {
    mockTenant(activeWebhook({ events: ['transaction.created'] }));

    await dispatcher.handleTransactionProcessed(event);

    expect(httpService.post).not.toHaveBeenCalled();
  });
});
