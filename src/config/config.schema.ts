// Third´s Modules
import * as joi from 'joi';
import 'dotenv/config';

/**
 * Variables de entorno
 */
type EnvVars = {
  API_KEY: string;
  APP_NAME: string;
  DB_HOST: string;
  ENVIRONMENT: string;
  FIREBASE_CREDENTIALS?: string;
  JWT_SECRET: string;
  PORT: number;
  REDIS_HOST: string;
  REDIS_PASSWORD: string;
  REDIS_PORT: number;
  REDIS_ROOT_KEY: string;
  REDIS_TTL: number;
  SA_EMAIL: string;
  SA_PWD: string;
  SEED_ENABLED?: string;
  SEED_ENABLED_VAULT?: string;
  SMS_API_URL: string;
  SMS_TOKEN: string;
  VAULT_ADDR: string;
  VAULT_KV_MOUNT: string;
  VAULT_NAMESPACE: string;
  VAULT_ROLE_ID: string;
  VAULT_SECRET_ID: string;
  VAULT_SECRET_ID_WRAPPED?: string;
  VAULT_TOKEN: string;
  VAULT_TOKEN_RENEW_SAFETY_WINDOW_SEC?: number;
};

/**
 * Validate env variables
 */
export const configValidationSchema: joi.ObjectSchema = joi
  .object({
    API_KEY: joi.string().required(),
    APP_NAME: joi.string().required(),
    DB_HOST: joi.string().required(),
    ENVIRONMENT: joi.alternatives().try(joi.string().valid('DEVELOPMENT', 'PRODUCTION', 'TEST').required()),
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
    SMS_API_URL: joi.string().required(),
    SMS_TOKEN: joi.string().required(),
    VAULT_ADDR: joi.string().required(),
    VAULT_KV_MOUNT: joi.string().required(),
    VAULT_NAMESPACE: joi.string().required(),
    VAULT_ROLE_ID: joi.string().required(),
    VAULT_SECRET_ID: joi.string().required(),
    VAULT_SECRET_ID_WRAPPED: joi.string().optional(),
    VAULT_TOKEN: joi.string().required(),
    VAULT_TOKEN_RENEW_SAFETY_WINDOW_SEC: joi.number().optional(),
  })
  .unknown(true);

// Validar las variables de entorno
const validationResult = configValidationSchema.validate(process.env, {
  abortEarly: false,
});

// Lanzar error si hay un error en la validación
if (validationResult.error) {
  throw new Error(`Config validation error: ${validationResult.error.message}`);
}

/**
 * Variables de entorno
 */
const envVars: EnvVars = validationResult.value as unknown as EnvVars;

/**
 * Exportar las variables de number
 */
export const envs = {
  API_KEY: envVars.API_KEY,
  APP_NAME: envVars.APP_NAME,
  DB_HOST: envVars.DB_HOST,
  ENVIRONMENT: envVars.ENVIRONMENT,
  FIREBASE_CREDENTIALS: envVars.FIREBASE_CREDENTIALS,
  JWT_SECRET: envVars.JWT_SECRET,
  PORT: envVars.PORT,
  REDIS_HOST: envVars.REDIS_HOST,
  REDIS_PASSWORD: envVars.REDIS_PASSWORD,
  REDIS_PORT: envVars.REDIS_PORT,
  REDIS_ROOT_KEY: envVars.REDIS_ROOT_KEY,
  REDIS_TTL: envVars.REDIS_TTL,
  SA_EMAIL: envVars.SA_EMAIL,
  SA_PWD: envVars.SA_PWD,
  SEED_ENABLED: envVars.SEED_ENABLED,
  SEED_ENABLED_VAULT: envVars.SEED_ENABLED_VAULT,
  SMS_API_URL: envVars.SMS_API_URL,
  SMS_TOKEN: envVars.SMS_TOKEN,
  VAULT_ADDR: envVars.VAULT_ADDR,
  VAULT_KV_MOUNT: envVars.VAULT_KV_MOUNT,
  VAULT_NAMESPACE: envVars.VAULT_NAMESPACE,
  VAULT_ROLE_ID: envVars.VAULT_ROLE_ID,
  VAULT_SECRET_ID: envVars.VAULT_SECRET_ID,
  VAULT_SECRET_ID_WRAPPED: envVars.VAULT_SECRET_ID_WRAPPED,
  VAULT_TOKEN: envVars.VAULT_TOKEN,
  VAULT_TOKEN_RENEW_SAFETY_WINDOW_SEC: envVars.VAULT_TOKEN_RENEW_SAFETY_WINDOW_SEC,
};
