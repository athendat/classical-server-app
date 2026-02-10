import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AsyncContextService } from '../context/async-context.service';

/**
 * Datos capturados de la solicitud HTTP
 */
interface CapturedRequest {
  method: string;
  path: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  headers?: {
    userAgent?: string;
    ipAddress?: string;
    referer?: string;
  };
}

/**
 * Datos capturados de la respuesta HTTP
 */
interface CapturedResponse {
  statusCode: number;
  body: any;
}

/**
 * Interceptor global para auditoría HTTP
 *
 * Responsabilidades:
 * - Capturar body y headers de request
 * - Capturar statusCode y response body
 * - Redactar campos sensibles (passwords, tokens, keys)
 * - Inyectar metadata en AsyncLocalStorage
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  // Límite de tamaño para captura de respuesta (1MB)
  private readonly MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB
  // Máxima profundidad de serialización
  private readonly MAX_DEPTH = 5;
  // Máximo de items en array antes de truncar
  private readonly MAX_ARRAY_LENGTH = 50;

  // Campos que deben ser redactados por seguridad
  private readonly sensitiveFields = [
    'password',
    'token',
    'secret',
    'apiKey',
    'refreshToken',
    'pin',
    'pan',
    'privateKey',
    'jwe',
    'jwt',
    'bearer',
  ];

  constructor(
    private readonly asyncContext: AsyncContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // 1. Capturar request
    const capturedRequest = this.captureRequest(req);
    // ⭐ Obtener requestId de AsyncContextService (ClsService), no de req
    const requestId = this.asyncContext.getRequestId();

    // 2. Inyectar metadata inicial en contexto
    this.asyncContext.setHttpMetadata({
      capturedRequest,
      requestId,
    });

    // ⭐ INTERCEPTAR res.json() para capturar el BODY REAL que se envía al cliente
    // El tap() de NestJS recibe el objeto res completo, no el body
    // Necesitamos capturar el body ANTES de que Express lo serialice
    const originalJson = res.json.bind(res);
    let actualResponseBody: any = null;

    (res as any).json = function (body: any) {
      actualResponseBody = body; // ⭐ Capturar el body AQUÍ
      return originalJson(body);
    };

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;

        // ⭐ IMPORTANTE: Hacer la captura de respuesta asincrónica (setImmediate) para no bloquear
        // Si la respuesta es muy grande, serializeValue() podría bloquear el hilo principal
        setImmediate(() => {
          try {
            // Usar el body real capturado de res.json()
            const capturedResponse = this.captureResponse(
              res.statusCode,
              actualResponseBody,
            );

            // 3. Actualizar contexto con respuesta y timing
            this.asyncContext.setHttpMetadata({
              capturedRequest,
              capturedResponse,
              responseTime: duration,
              statusCode: res.statusCode,
            });

            // ⭐ 4. EMITIR EVENTO PARA ACTUALIZAR AUDITORÍA CON RESPONSE
            // Esto permite que auditorías registradas DURANTE la ejecución del controlador
            // sean actualizadas con la response y statusCode DESPUÉS de que se capturen
            this.eventEmitter.emit('audit.response-captured', {
              requestId,
              statusCode: res.statusCode,
              response: capturedResponse.body,
              responseTime: duration,
              method: capturedRequest.method,
              endpoint: capturedRequest.path,
              headers: capturedRequest.headers,
              timestamp: new Date().toISOString(),
            });

            this.logger.log(
              `[${requestId}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`,
            );
          } catch (error: any) {
            this.logger.warn(`Failed to capture response: ${error.message}`);
          }
        });
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.error(
          `[${requestId}] ${req.method} ${req.path} → ERROR (${duration}ms): ${error.message}`,
        );

        // Propagar error original
        throw error;
      }),
    );
  }

  /**
   * Capturar datos relevantes de la request
   */
  private captureRequest(req: Request): CapturedRequest {
    return {
      method: req.method,
      path: req.path,
      query:
        req.query && Object.keys(req.query).length > 0
          ? (req.query as Record<string, any>)
          : undefined,
      body: this.redactSensitiveData(req.body),
      headers: {
        userAgent: req.get('user-agent'),
        ipAddress: this.extractIpAddress(req),
        referer: req.get('referer'),
      },
    };
  }

  /**
   * Capturar datos relevantes de la response
   * Recibe el body REAL del controlador, no el objeto HTTP
   */
  private captureResponse(statusCode: number, body: any): CapturedResponse {
    let capturedBody = body;

    // Si es null o undefined, devolver como está
    if (body === null || body === undefined) {
      return {
        statusCode,
        body: body,
      };
    }

    // Si es un array, limitar a 5 items para auditoría
    if (Array.isArray(body)) {
      if (body.length > 5) {
        capturedBody = {
          _type: 'ARRAY',
          _length: body.length,
          _items: body.slice(0, 2),
          _summary: `Array with ${body.length} items`,
        };
      }
    } else if (
      body &&
      typeof body === 'object' &&
      typeof body.data !== 'undefined' &&
      Array.isArray(body.data) &&
      body.data.length > 5
    ) {
      // Caso de respuesta paginada: {data: [...], pagination: {...}}
      capturedBody = {
        ...body,
        data: {
          _type: 'ARRAY',
          _length: body.data.length,
          _items: body.data.slice(0, 2),
          _summary: `Array with ${body.data.length} items`,
        },
      };
    }

    return {
      statusCode,
      body: this.redactSensitiveData(capturedBody),
    };
  }

  /**
   * Redactar campos sensibles de objetos con límites de tamaño
   */
  private redactSensitiveData(obj: any, depth = 0): any {
    if (!obj || typeof obj !== 'object' || depth > this.MAX_DEPTH) {
      return obj;
    }

    try {
      const sanitized = this.serializeValue(obj, 0);
      return sanitized;
    } catch (error: any) {
      this.logger.warn(`Failed to redact sensitive data: ${error.message}`);
      return '[ERROR_SERIALIZING]';
    }
  }

  /**
   * Serializar valores con límites de tamaño y profundidad
   * Previene memory leaks por objetos grandes o referencias circulares
   */
  private serializeValue(value: any, depth = 0): any {
    // Límite de profundidad
    if (depth > this.MAX_DEPTH) {
      return '[MAX_DEPTH_REACHED]';
    }

    // Valores primitivos
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== 'object') {
      return value;
    }

    // Manejar Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
      };
    }

    // Manejar Buffers y datos binarios
    if (Buffer.isBuffer(value)) {
      return '[Buffer]';
    }

    // Manejar Dates
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Manejar arrays con límite de tamaño
    if (Array.isArray(value)) {
      if (value.length > this.MAX_ARRAY_LENGTH) {
        return {
          _type: 'ARRAY_TRUNCATED',
          _length: value.length,
          _items: value
            .slice(0, 3)
            .map((item) => this.serializeValue(item, depth + 1)),
          _note: `Showing 3 of ${value.length} items`,
        };
      }

      return value.map((item) => this.serializeValue(item, depth + 1));
    }

    // Manejar objetos planos
    if (value.constructor === Object) {
      const keys = Object.keys(value);
      const result: Record<string, any> = {};
      let size = 0;

      for (const key of keys) {
        // Limitar tamaño total
        if (size > 100000) {
          result._truncated = true;
          break;
        }

        try {
          const serialized = this.serializeValue(value[key], depth + 1);

          // Redactar campos sensibles
          if (
            this.sensitiveFields.some((field) =>
              key.toLowerCase().includes(field.toLowerCase()),
            )
          ) {
            result[key] = '***REDACTED***';
          } else {
            result[key] = serialized;
          }

          size += JSON.stringify(serialized).length;
        } catch (e) {
          result[key] = '[UNSERIALIZABLE]';
        }
      }

      return result;
    }

    // Otros tipos de objetos (instancias de clases, Mongoose docs, etc.)
    // Convertir a object plano primero, luego procesar recursivamente
    try {
      // Intentar convertir a JSON y parsear (convierte documentos Mongoose a objetos planos)
      const plain = JSON.parse(JSON.stringify(value));
      return this.serializeValue(plain, depth + 1);
    } catch (e) {
      // Si JSON.stringify falla, intentar extraer propiedades enumerables
      try {
        const keys = Object.keys(value);
        const result: Record<string, any> = {};
        let size = 0;

        for (const key of keys) {
          if (size > 50000) {
            result._truncated = true;
            break;
          }

          try {
            const val = value[key];
            const serialized = this.serializeValue(val, depth + 1);

            if (
              this.sensitiveFields.some((field) =>
                key.toLowerCase().includes(field.toLowerCase()),
              )
            ) {
              result[key] = '***REDACTED***';
            } else {
              result[key] = serialized;
            }

            size += JSON.stringify(serialized).length;
          } catch (keyError) {
            result[key] = '[UNSERIALIZABLE]';
          }
        }

        return result;
      } catch {
        return '[UNSUPPORTED_TYPE]';
      }
    }
  }

  /**
   * Recorrer objeto y redactar campos sensibles
   */
  private walkAndRedact(obj: any, depth = 0): void {
    if (!obj || typeof obj !== 'object' || depth > this.MAX_DEPTH) {
      return;
    }

    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        continue;
      }

      if (
        this.sensitiveFields.some((field) =>
          key.toLowerCase().includes(field.toLowerCase()),
        )
      ) {
        obj[key] = '***REDACTED***';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.walkAndRedact(obj[key], depth + 1);
      }
    }
  }

  /**
   * Extraer IP address de la request
   */
  private extractIpAddress(req: Request): string {
    const forwarded = req.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0]?.trim() || 'unknown';
    }

    const realIp = req.get('x-real-ip');
    if (realIp) {
      return realIp;
    }

    return req.ip || 'unknown';
  }
}
