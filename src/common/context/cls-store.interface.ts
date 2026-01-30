import { ClsStore } from 'nestjs-cls';
import { ICacheService } from '../interfaces/cache.interface';
import { Actor } from '../interfaces';

/**
 * HTTP Metadata capturada por interceptor
 */
export interface HttpAuditMetadata {
  capturedRequest?: {
    method: string;
    path: string;
    query?: Record<string, any>;
    body?: Record<string, any>;
    headers?: {
      userAgent?: string;
      ipAddress?: string;
      referer?: string;
    };
  };
  capturedResponse?: {
    statusCode: number;
    body: any;
  };
  responseTime?: number;
  statusCode?: number;
  requestId?: string;
}

/**
 * ⭐ App Cls Store: Interfaz tipada para el contexto de nestjs-cls
 *
 * Extiende ClsStore de nestjs-cls para agregar propiedades de la aplicación
 * Proporciona type-safety al trabajar con ClsService<AppClsStore>
 */
export interface AppClsStore extends ClsStore {
  // Identificador único de la request (generado por nestjs-cls o por nosotros)
  requestId: string;

  // Información del actor (usuario/servicio autenticado)
  actor?: Actor;

  // Metadata HTTP capturada por interceptor de auditoría
  httpMetadata?: HttpAuditMetadata;

  // Servicio de cache request-scoped
  cacheService?: ICacheService;

  // Timestamp del inicio de la request
  timestamp?: Date;

  // Metadata adicional
  metadata?: Record<string, any>;
}
