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
