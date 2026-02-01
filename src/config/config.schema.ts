// Third´s Modules
import * as joi from 'joi';
import 'dotenv/config';

/**
 * Variables de entorno
 */
type EnvVars = {
  API_KEY_CLASSICAL: string;
  DB_HOST: string;
  JWT_SECRET: string;
  PORT: number;
  REDIS_HOST: string;
  REDIS_PASSWORD: string;
  REDIS_PORT: number;
  REDIS_TTL: number;
  SA_EMAIL: string;
  SA_PWD: string;
};

/**
 * Validate env variables
 */
export const configValidationSchema: joi.ObjectSchema = joi
  .object({
    API_KEY_CLASSICAL: joi.string().required(),
    DB_HOST: joi.string().required(),
    JWT_SECRET: joi.string().required(),
    PORT: joi.number().required(),
    REDIS_HOST: joi.string().required(),
    REDIS_PASSWORD: joi.string().required(),
    REDIS_PORT: joi.number().required(),
    REDIS_TTL: joi.number().required(),
    SA_EMAIL: joi.string().required(),
    SA_PWD: joi.string().required(),
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
  API_KEY_CLASSICAL: envVars.API_KEY_CLASSICAL,
  DB_HOST: envVars.DB_HOST,
  JWT_SECRET: envVars.JWT_SECRET,
  PORT: envVars.PORT,
  REDIS_HOST: envVars.REDIS_HOST,
  REDIS_PORT: envVars.REDIS_PORT,
  REDIS_TTL: envVars.REDIS_TTL,
  SA_EMAIL: envVars.SA_EMAIL,
  SA_PWD: envVars.SA_PWD,
};
