// Third´s Modules
import * as joi from 'joi';

/**
 * Joi schema for environment variable validation.
 *
 * This module is intentionally side-effect-free: it only exports the schema.
 * Validation of `process.env` runs once, via NestJS `ConfigModule`
 * (`validationSchema: configValidationSchema` in `app.module.ts`).
 */
export const configValidationSchema: joi.ObjectSchema = joi
  .object({
    API_KEY: joi.string().required(),
    APP_NAME: joi.string().required(),
    DB_HOST: joi.string().required(),
    ENVIRONMENT: joi.alternatives().try(joi.string().valid('DEVELOPMENT', 'PRODUCTION', 'SANDBOX').required()),
    FIREBASE_CREDENTIALS: joi.string().optional(),
    JWT_SECRET: joi.string().required(),
    PORT: joi.number().required(),
    REDIS_HOST: joi.string().required(),
    REDIS_PASSWORD: joi.string().required(),
    REDIS_PORT: joi.number().required(),
    REDIS_ROOT_KEY: joi.string().required(),
    REDIS_TTL: joi.number().required(),
    SA_EMAIL: joi.string().required(),
    SA_PWD: joi.string().required(),
    SEED_ENABLED: joi.string().optional(),
    SEED_ENABLED_VAULT: joi.string().optional(),
    SGT_AES_KEY: joi.string().required(),
    SGT_AES_IV: joi.string().required(),
    SGT_URL: joi.string().required(),
    SGT_HMAC_SECRET: joi.string().required(),
    SGT_CLIENT_ID: joi.string().required(),
    SMS_API_URL: joi.string().required(),
    SMS_TOKEN: joi.string().required(),
    VAULT_ADDR: joi.string().required(),
    VAULT_KV_MOUNT: joi.string().required(),
    VAULT_NAMESPACE: joi.string().required(),
    VAULT_ROLE_ID: joi.string().optional().allow(''),
    VAULT_SECRET_ID: joi.string().optional().allow(''),
    VAULT_SECRET_ID_WRAPPED: joi.string().optional().allow(''),
    VAULT_TOKEN: joi.string().optional().allow(''),
    VAULT_TOKEN_RENEW_SAFETY_WINDOW_SEC: joi.number().optional(),
  })
  .unknown(true)
  // Vault auth: require either a static VAULT_TOKEN (legacy) or the AppRole
  // pair VAULT_ROLE_ID + VAULT_SECRET_ID (recommended). VAULT_SECRET_ID_WRAPPED
  // counts as a SecretID for this purpose. See issue #38.
  .custom((value, helpers) => {
    const hasToken = !!value.VAULT_TOKEN;
    const hasAppRole =
      !!value.VAULT_ROLE_ID &&
      (!!value.VAULT_SECRET_ID || !!value.VAULT_SECRET_ID_WRAPPED);
    if (!hasToken && !hasAppRole) {
      return helpers.message(
        'Vault auth misconfigured: set VAULT_TOKEN or (VAULT_ROLE_ID + VAULT_SECRET_ID)' as never,
      );
    }
    return value;
  });
