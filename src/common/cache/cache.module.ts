// Nest Modules
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Third's Modules
import { RedisModule, RedisSingleOptions } from '@nestjs-modules/ioredis';

// Service
import { CacheService } from './cache.service';

/**
 * Construye la configuración de Redis a partir de las variables de entorno
 * @param configService - Servicio de configuración de NestJS
 * @returns Objeto con la configuración de Redis
 */
const buildRedisConfig = (configService: ConfigService) => {
  const redisHost = configService.get<string>(`REDIS_HOST`);
  const redisPort = configService.get<string>(`REDIS_PORT`);
  const redisPassword = configService.get<string>(`REDIS_PASSWORD`);
  const redisTtl = configService.get<number>(`REDIS_TTL`);
  const redisUrl = `redis://:${redisPassword}@${redisHost}:${redisPort}`;
  return { redisUrl, redisTtl };
};

@Module({
  imports: [
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { redisUrl } = buildRedisConfig(configService);
        const options: RedisSingleOptions = {
          type: 'single',
          url: redisUrl,
        };

        return options;
      },
    }),
  ],
  providers: [CacheService],
  exports: [RedisModule, CacheService],
})
export class CachingModule {}
