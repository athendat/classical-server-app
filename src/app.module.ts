// Nest Modules
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';

// Shared Modules
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthzModule } from './modules/authz/authz.module';
import { ModulesModule } from './modules/modules';
import { RolesModule } from './modules/roles';
import { SharedContextModule } from './shared/shared-context.module';
import { UsersModule } from './modules/users/users.module';
import { VaultModule } from './modules/vault/vault.module';

// Controller
import { AppController } from './app.controller';

// Services
import { AsyncContextService } from './common/context/async-context.service';
import { InMemoryAntiReplayCacheService } from './common/cache/in-memory-anti-replay.service';
import { InMemoryCacheService } from './common/cache/in-memory-cache.service';

// Middlewares
import {
  AuthMiddleware,
  LoggingMiddleware,
  RequestIdMiddleware,
} from './middlewares';

// Interceptors
import { AuthenticationInterceptor } from './common/interceptors/authentication.interceptor';

// Config Schema
import { configValidationSchema } from './config/config.schema';

// Constants
import { INJECTION_TOKENS } from './common/constants/injection-tokens';

@Module({
  imports: [
    // ⭐ SharedContextModule: Importar PRIMERO para que ClsService esté disponible globalmente
    SharedContextModule,

    // Modules
    AuditModule,
    AuthModule,
    AuthzModule,
    // KeysModule,
    ModulesModule,
    RolesModule,
    // TerminalsModule,
    UsersModule,
    VaultModule,

    // Validation Schemas
    ConfigModule.forRoot({
      validationSchema: configValidationSchema,
      isGlobal: true,
    }),

    // Events
    EventEmitterModule.forRoot(),

    // Throttler Module
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60,
          limit: 10,
        },
      ],
    }),

    // MongoDB connection
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get('DB_HOST'),
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    // Global interceptor para autenticación (establecer actor en contexto async)
    {
      provide: APP_INTERCEPTOR,
      useClass: AuthenticationInterceptor,
    },
    // Services
    AsyncContextService,
    {
      provide: INJECTION_TOKENS.CACHE_SERVICE,
      useClass: InMemoryCacheService,
    },
    {
      provide: INJECTION_TOKENS.ANTI_REPLAY_CACHE,
      useClass: InMemoryAntiReplayCacheService,
    },
  ],
  exports: [
    AsyncContextService,
    INJECTION_TOKENS.CACHE_SERVICE,
    INJECTION_TOKENS.ANTI_REPLAY_CACHE,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplicar LoggingMiddleware PRIMERO a TODAS las rutas
    consumer.apply(LoggingMiddleware).forRoutes('*');

    // Aplicar RequestIdMiddleware a TODAS las rutas
    consumer.apply(RequestIdMiddleware).forRoutes('*');

    // Luego aplicar AuthMiddleware a TODAS las rutas
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
  static port: number | string;

  /**
   * Constructor
   */
  constructor(private readonly configService: ConfigService) {
    AppModule.port =
      process.env.PORT ?? configService.get<number>('PORT') ?? '9053';
  }
}
