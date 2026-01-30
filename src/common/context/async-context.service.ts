import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore, HttpAuditMetadata } from './cls-store.interface';
import { Actor } from '../interfaces';

/**
 * AsyncContextService: Wrapper alrededor de ClsService de nestjs-cls
 *
 * ⭐ IMPORTANTE: Desde la introducción de nestjs-cls, este servicio es un adapter
 * que proporciona una interfaz más cómoda y tipada sobre ClsService<AppClsStore>
 *
 * nestjs-cls maneja automáticamente la propagación de contexto async, por lo que
 * no necesitamos enterWith() ni run() manualmente - ClsModule lo hace por nosotros.
 *
 * El contexto se propaga automáticamente a través de:
 * - Middleware (setup en ClsModule.forRoot)
 * - Todas las operaciones async (promesas, callbacks, etc.)
 * - Interceptores, guardias, etc.
 */
@Injectable()
export class AsyncContextService {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  /**
   * Establecer el contexto actual
   * (En realidad, con nestjs-cls esto se hace en el setup del ClsModule)
   * Este método es para cambios posteriores si es necesario
   */
  setContext(context: Partial<AppClsStore>): void {
    Object.entries(context).forEach(([key, value]) => {
      this.cls.set(key as any, value);
    });
  }

  /**
   * Establecer información del actor
   */
  setActor(actor: Actor): void {
    this.cls.set('actor', actor);
  }

  /**
   * Establecer metadata HTTP capturada por interceptor
   */
  setHttpMetadata(metadata: HttpAuditMetadata): void {
    const currentMetadata = this.cls.get<HttpAuditMetadata>('httpMetadata');
    this.cls.set('httpMetadata', {
      ...currentMetadata,
      ...metadata,
    });
  }

  /**
   * Obtener el contexto actual completo
   */
  getContext(): AppClsStore | undefined {
    // ClsService proporciona acceso a las propiedades almacenadas
    // Devolvemos un objeto con todas las propiedades conocidas
    return {
      requestId: this.getRequestId(),
      actor: this.getActor(),
      httpMetadata: this.getHttpMetadata(),
    } as AppClsStore;
  }

  /**
   * Obtener el ID de la request actual
   * Retorna el ID asignado por nestjs-cls o 'unknown' si no está disponible
   */
  getRequestId(): string {
    const requestId = this.cls.getId() ?? this.cls.get<string>('requestId');
    return requestId ?? 'unknown';
  }

  /**
   * Obtener el actor actual (usuario/servicio)
   */
  getActor(): Actor | undefined {
    return this.cls.get<Actor>('actor');
  }

  /**
   * Obtener el actor actual (usuario/servicio)
   */
  getActorId(): string | undefined {
    return this.cls.get<Actor>('actor')?.actorId;
  }

  /**
   * Obtener la metadata HTTP
   */
  getHttpMetadata(): HttpAuditMetadata | undefined {
    return this.cls.get<HttpAuditMetadata>('httpMetadata');
  }

  /**
   * Ejecutar una función dentro de un contexto específico
   * (Usado principalmente en testing)
   */
  run<T>(context: Partial<AppClsStore>, fn: () => T): T {
    return this.cls.runWith(context as AppClsStore, fn);
  }
}
