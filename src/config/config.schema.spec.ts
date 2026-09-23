import { configValidationSchema } from './config.schema';

/**
 * Issue #38 — VAULT_TOKEN era required(), forzando un token estático que al
 * expirar dejaba api-classical en crash-loop pese a tener AppRole válido.
 * El schema debe aceptar cualquiera de los dos modos de auth.
 */
describe('configValidationSchema — Vault auth modes', () => {
  const baseEnv: Record<string, string> = {
    API_KEY: 'k',
    APP_NAME: 'classical-server-app',
    DB_HOST: 'mongodb://localhost:27017/fx',
    ENVIRONMENT: 'DEVELOPMENT',
    JWT_SECRET: 's',
    PORT: '9053',
    REDIS_HOST: 'localhost',
    REDIS_PASSWORD: 'p',
    REDIS_PORT: '6379',
    REDIS_ROOT_KEY: 'app_',
    REDIS_TTL: '3600',
    SA_EMAIL: 'sa@example.com',
    SA_PWD: 'pwd',
    SGT_AES_KEY: 'aes',
    SGT_AES_IV: 'iv',
    SGT_URL: 'https://sgt.example',
    SGT_HMAC_SECRET: 'hmac',
    SGT_CLIENT_ID: 'cid',
    SGT_API_KEY: 'api-key',
    SMS_API_URL: 'https://sms.example',
    SMS_TOKEN: 'tok',
    VAULT_ADDR: 'https://vault.example',
    VAULT_KV_MOUNT: 'classical',
    VAULT_NAMESPACE: 'admin',
  };

  it('accepts AppRole credentials without VAULT_TOKEN', () => {
    const { error } = configValidationSchema.validate({
      ...baseEnv,
      VAULT_ROLE_ID: 'role-123',
      VAULT_SECRET_ID: 'secret-123',
    });
    expect(error).toBeUndefined();
  });

  it('accepts a static VAULT_TOKEN without AppRole credentials', () => {
    const { error } = configValidationSchema.validate({
      ...baseEnv,
      VAULT_TOKEN: 'hvs.legacy-token',
    });
    expect(error).toBeUndefined();
  });

  it('rejects when neither VAULT_TOKEN nor AppRole credentials are present', () => {
    const { error } = configValidationSchema.validate({ ...baseEnv });
    expect(error).toBeDefined();
    expect(error?.message).toContain('Vault auth misconfigured');
  });

  it('rejects when only VAULT_ROLE_ID is present (incomplete AppRole)', () => {
    const { error } = configValidationSchema.validate({
      ...baseEnv,
      VAULT_ROLE_ID: 'role-123',
    });
    expect(error).toBeDefined();
  });
});

/**
 * Issue #60 — SGT_MODE=live|simulated (default live). In simulated mode the
 * Issuer is simulated in-process, so the SGT_* connection variables are optional.
 */
describe('configValidationSchema — SGT_MODE', () => {
  const sgtVars = [
    'SGT_AES_KEY',
    'SGT_AES_IV',
    'SGT_URL',
    'SGT_HMAC_SECRET',
    'SGT_CLIENT_ID',
    'SGT_API_KEY',
  ];
  const baseEnv: Record<string, string> = {
    API_KEY: 'k',
    APP_NAME: 'classical-server-app',
    DB_HOST: 'mongodb://localhost:27017/fx',
    ENVIRONMENT: 'SANDBOX',
    JWT_SECRET: 's',
    PORT: '9053',
    REDIS_HOST: 'localhost',
    REDIS_PASSWORD: 'p',
    REDIS_PORT: '6379',
    REDIS_ROOT_KEY: 'app_',
    REDIS_TTL: '3600',
    SA_EMAIL: 'sa@example.com',
    SA_PWD: 'pwd',
    SGT_AES_KEY: 'aes',
    SGT_AES_IV: 'iv',
    SGT_URL: 'https://sgt.example',
    SGT_HMAC_SECRET: 'hmac',
    SGT_CLIENT_ID: 'cid',
    SGT_API_KEY: 'api-key',
    SMS_API_URL: 'https://sms.example',
    SMS_TOKEN: 'tok',
    VAULT_ADDR: 'https://vault.example',
    VAULT_KV_MOUNT: 'classical',
    VAULT_NAMESPACE: 'admin',
    VAULT_TOKEN: 'hvs.token',
  };
  const withoutSgtVars = (env: Record<string, string>) =>
    Object.fromEntries(Object.entries(env).filter(([key]) => !sgtVars.includes(key)));

  it('defaults SGT_MODE to live', () => {
    const { error, value } = configValidationSchema.validate(baseEnv);
    expect(error).toBeUndefined();
    expect(value.SGT_MODE).toBe('live');
  });

  it('rejects an unknown SGT_MODE', () => {
    const { error } = configValidationSchema.validate({ ...baseEnv, SGT_MODE: 'mock' });
    expect(error).toBeDefined();
  });

  it('still requires the SGT_* variables in live mode', () => {
    const { error } = configValidationSchema.validate({
      ...withoutSgtVars(baseEnv),
      SGT_MODE: 'live',
    });
    expect(error).toBeDefined();
  });

  // Issue #64 — the real adapter reads SGT_API_KEY on every Card activation and
  // Settlement; a live deployment without it must not start.
  it('refuses live mode without SGT_API_KEY', () => {
    const { SGT_API_KEY: _omitted, ...env } = baseEnv;
    const { error } = configValidationSchema.validate({ ...env, SGT_MODE: 'live' });
    expect(error).toBeDefined();
    expect(error?.message).toContain('SGT_API_KEY');
  });

  it('refuses SGT_MODE=simulated with ENVIRONMENT=PRODUCTION', () => {
    const { error } = configValidationSchema.validate({
      ...baseEnv,
      ENVIRONMENT: 'PRODUCTION',
      SGT_MODE: 'simulated',
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('SGT_MODE=simulated');
  });

  it('accepts SGT_MODE=live with ENVIRONMENT=PRODUCTION', () => {
    const { error } = configValidationSchema.validate({
      ...baseEnv,
      ENVIRONMENT: 'PRODUCTION',
      SGT_MODE: 'live',
    });
    expect(error).toBeUndefined();
  });

  it('accepts an empty SGT_SIMULATED_INITIAL_BALANCE_MINOR (the simulator uses its default)', () => {
    const { error } = configValidationSchema.validate({
      ...baseEnv,
      SGT_MODE: 'simulated',
      SGT_SIMULATED_INITIAL_BALANCE_MINOR: '',
    });
    expect(error).toBeUndefined();
  });

  it('does not require the SGT_* variables in simulated mode', () => {
    const { error } = configValidationSchema.validate({
      ...withoutSgtVars(baseEnv),
      SGT_MODE: 'simulated',
    });
    expect(error).toBeUndefined();
  });
});
