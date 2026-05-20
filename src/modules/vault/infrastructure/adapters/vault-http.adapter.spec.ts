import axios from 'axios';
import { VaultHttpAdapter } from './vault-http.adapter';

jest.mock('axios');

/**
 * Issue #38 — el VAULT_TOKEN estático asumía 24h de TTL a ciegas y nunca
 * caía a AppRole. Esta suite verifica:
 *  - onModuleInit descubre el TTL real vía lookup-self
 *  - operaciones KV reintentan vía AppRole ante 401/403
 */
describe('VaultHttpAdapter — issue #38 token lifecycle', () => {
  const FRESH_TOKEN = 'hvs.fresh-approle-token';
  const STATIC_TOKEN = 'hvs.static-token';

  type MockHttp = {
    get: jest.Mock;
    post: jest.Mock;
    delete: jest.Mock;
    defaults: { headers: { common: Record<string, string> } };
  };

  let http: MockHttp;

  const buildConfig = (overrides: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
      VAULT_ADDR: 'https://vault.example',
      VAULT_NAMESPACE: 'admin',
      VAULT_KV_MOUNT: 'classical',
      VAULT_ROLE_ID: 'role-123',
      VAULT_SECRET_ID: 'secret-123',
      VAULT_TOKEN: STATIC_TOKEN,
      ...overrides,
    };
    return { get: <T>(k: string): T => values[k] as T };
  };

  const buildAdapter = (configOverrides: Record<string, unknown> = {}) =>
    new VaultHttpAdapter(
      buildConfig(configOverrides) as never,
      { emit: jest.fn() } as never,
      { getRequestId: () => 'req-1' } as never,
    );

  /** axios error shaped like a real Vault HTTP failure */
  const vaultHttpError = (status: number) => ({
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    response: { status, data: { errors: ['permission denied', 'invalid token'] } },
  });

  beforeEach(() => {
    http = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      defaults: { headers: { common: {} } },
    };
    (axios.create as jest.Mock).mockReturnValue(http);
    (axios.isAxiosError as unknown as jest.Mock).mockImplementation(
      (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
    );
  });

  it('falls back to AppRole login when the static token is already expired', async () => {
    // lookup-self reports a 1-second TTL — token is effectively dead.
    http.get.mockImplementation((url: string) => {
      if (url.includes('lookup-self')) {
        return Promise.resolve({ data: { data: { ttl: 1, renewable: false } } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    // AppRole login succeeds with a fresh token.
    http.post.mockImplementation((url: string) => {
      if (url.includes('approle/login')) {
        return Promise.resolve({
          data: {
            auth: {
              client_token: FRESH_TOKEN,
              token_renewable: true,
              token_duration: 3600,
            },
          },
        });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    const adapter = buildAdapter();
    await adapter.onModuleInit();

    const tokenResult = await adapter.getToken();

    expect(tokenResult.isSuccess).toBe(true);
    expect(tokenResult.getValue()).toBe(FRESH_TOKEN);
  });

  it('writeKV retries via AppRole login when the first attempt returns 403', async () => {
    let kvWriteAttempts = 0;
    http.post.mockImplementation((url: string) => {
      if (url.includes('approle/login')) {
        return Promise.resolve({
          data: {
            auth: {
              client_token: FRESH_TOKEN,
              token_renewable: true,
              token_duration: 3600,
            },
          },
        });
      }
      // KV write path: first attempt fails 403, retry succeeds.
      kvWriteAttempts += 1;
      if (kvWriteAttempts === 1) {
        return Promise.reject(vaultHttpError(403));
      }
      return Promise.resolve({ data: { data: { value: 'stored' } } });
    });

    const adapter = buildAdapter();
    // No onModuleInit: constructor leaves the static token "valid" by clock,
    // so getToken() returns it and the 403 only surfaces on the HTTP call.
    const result = await adapter.writeKV('jwks-private/jwks-default', {
      value: 'pem',
    });

    expect(result.isSuccess).toBe(true);
    expect(kvWriteAttempts).toBe(2);
    expect(
      http.post.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes('approle/login'),
      ),
    ).toBe(true);
  });

  it('writeKV does not retry when no AppRole credentials are configured', async () => {
    let kvWriteAttempts = 0;
    http.post.mockImplementation((url: string) => {
      if (url.includes('approle/login')) {
        return Promise.reject(new Error('login should not be called'));
      }
      kvWriteAttempts += 1;
      return Promise.reject(vaultHttpError(403));
    });

    const adapter = buildAdapter({ VAULT_ROLE_ID: '', VAULT_SECRET_ID: '' });
    const result = await adapter.writeKV('jwks-private/jwks-default', {
      value: 'pem',
    });

    expect(result.isSuccess).toBe(false);
    expect(kvWriteAttempts).toBe(1);
  });

  it('rejects a KV path containing path traversal without issuing any request', async () => {
    const adapter = buildAdapter();

    const result = await adapter.writeKV('../../sys/policies/acl/root', {
      value: 'pem',
    });

    expect(result.isSuccess).toBe(false);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('treats a non-expiring static token (lookup-self ttl=0) as valid', async () => {
    http.get.mockImplementation((url: string) => {
      if (url.includes('lookup-self')) {
        return Promise.resolve({ data: { data: { ttl: 0, renewable: false } } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    http.post.mockImplementation((url: string) =>
      Promise.reject(new Error(`no HTTP call expected, got ${url}`)),
    );

    const adapter = buildAdapter();
    await adapter.onModuleInit();

    const tokenResult = await adapter.getToken();

    expect(tokenResult.isSuccess).toBe(true);
    expect(tokenResult.getValue()).toBe(STATIC_TOKEN);
  });

  it('keeps the provisional token when lookup-self fails with a network error', async () => {
    http.get.mockImplementation((url: string) => {
      if (url.includes('lookup-self')) {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    http.post.mockImplementation((url: string) =>
      Promise.reject(new Error(`no login expected, got ${url}`)),
    );

    const adapter = buildAdapter();
    await adapter.onModuleInit();

    const tokenResult = await adapter.getToken();

    expect(tokenResult.isSuccess).toBe(true);
    expect(tokenResult.getValue()).toBe(STATIC_TOKEN);
  });
});
