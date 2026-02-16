import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';

// Nest Modules
import { Logger, ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DocumentBuilder,
  SwaggerCustomOptions,
  SwaggerModule,
} from '@nestjs/swagger';

// Third's Modules
import { WinstonModule } from 'nest-winston';
import * as luxon from 'luxon';
import * as winston from 'winston';
import helmet from 'helmet';

// App Module
import { AppModule } from './app.module';
import { AuditInterceptor } from './common/interceptors';
import { AsyncContextService } from './common/context/async-context.service';

/**
 *  Start the application
 */
async function bootstrap() {
  // Configurar Luxon para usar español como idioma predeterminado
  luxon.Settings.defaultLocale = 'es';

  // Logger
  const logger = new Logger('bootstrap');

  // App
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.timestamp({
              format: 'YYYY-MM-DD hh:mm:ss.SSS A',
            }),
            winston.format.align(),
            winston.format.printf((log: unknown) => {
              const info = log as Record<string, unknown>;
              const context =
                typeof info.context === 'string' && info.context
                  ? `[${info.context}] `
                  : '';
              const timestamp =
                typeof info.timestamp === 'string' ? info.timestamp : '';
              const level = typeof info.level === 'string' ? info.level : '';
              const message =
                typeof info.message === 'string'
                  ? info.message
                  : JSON.stringify(info.message);
              return `[${timestamp}] ${level}: ${context}${message}`;
            }),
          ),
        }),
        // Añade otros transportes si es necesario
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
      ],
    }),
    bufferLogs: true,
  });

  // Cors - Configurado con credentials para cookies
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:4200';

  // Debug: Ver exactamente qué orígenes se están configurando
  const allowedOrigins = corsOrigin
    .split(',')
    .map((origin) => origin.trim());

  console.log('CORS Origins configurados:', allowedOrigins); // ← Para debugging

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-csrf-token', 'x-xsrf-token'],
    exposedHeaders: ['Content-Type', 'x-api-key'],
    optionsSuccessStatus: 200,
    maxAge: 86400, // 24 horas de cache en preflight
  });

  // Global configuration
  app.setGlobalPrefix('api_053', {
    exclude: [
      { path: '', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });

  // Global pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // ⭐ Global interceptors for audit
  // Con nestjs-cls, la propagación de contexto async es automática
  // No necesitamos ContextInterceptor como antes
  const asyncContext = app.get(AsyncContextService);
  const eventEmitter = app.get(EventEmitter2);

  app.useGlobalInterceptors(new AuditInterceptor(asyncContext, eventEmitter));

  // Cookie parser - YA ESTÁ CONFIGURADO EN app.module.ts configure()
  // const cookieSecret = process.env.COOKIE_SECRET || 'dev-cookie-secret';
  // app.use(cookieParser(cookieSecret));

  // Securities modules
  app.use(helmet());

  // Load data in request
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Metadata for Swagger
  // If you need to use metaData, keep this block and use it in SwaggerModule.setup, otherwise remove it if unused.
  const metaData = new DocumentBuilder()
    .setTitle('Classical Services')
    .setDescription('Servicios de gestión para Classical Services')
    .setVersion('0.0.1')
    .addServer(`http://127.0.0.1:${AppModule.port}`)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'Bearer Token',
    )
    .addApiKey(
      {
        type: 'apiKey', // this should be apiKey
        name: 'x-api-key', // this is the name of the key you expect in header
        in: 'header',
      },
      'x-api-key', // this is the name to show and used in swagger
    )
    .build();

  // Swagger options
  const swaggerCustomOptions: SwaggerCustomOptions = {
    swaggerUrl: `http://127.0.0.1:${AppModule.port}/swagger`,
    customSiteTitle: 'Classical Services Endpoints',
    jsonDocumentUrl: 'swagger/json',
  };

  // Swagger document
  const document = SwaggerModule.createDocument(app, metaData);

  // Start swagger
  SwaggerModule.setup('swagger', app, document, swaggerCustomOptions);

  // Define port
  await app.listen(AppModule.port);

  // Start logs
  Logger.log(
    `\n
       Classical Services is running on: ${await app.getUrl()}.\n
        Docs 📑 running on: ${await app.getUrl()}/swagger/\n
        Metrics 📊 running on: ${await app.getUrl()}/metrics\n
        Health 💚 running on: ${await app.getUrl()}/health\n
        Keep Secret! ㊙️\n
        `,
  );

  // Manejar excepciones no manejadas
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err.message, err.stack);
    console.error('Uncaught Exception:', err);
    // Intentar recuperarla
    // process.exit(1);
  });

  // Manejar promesas rechazadas no manejadas
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Manejar la promesa de alguna manera
    // process.exit(1);
  });
}
bootstrap();
