import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from 'src/modules/auth/decorators/permissions.decorator';
import { PermissionsService } from '../../application/permissions.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { Actor } from 'src/common/interfaces';

/**
 * Guard que valida permisos requeridos contra los del actor.
 * Soporta: permisos exactos, wildcards por módulo (module.*) y wildcard global (*)
 * Deny-by-default: si no hay permisos o no coinciden, deniega.
 * Audita todos los intentos de acceso denegado con latencia, statusCode y respuesta.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private PermissionsService: PermissionsService,
    private auditService: AuditService,
  ) {}

  /**
   * Calcular latencia desde el timestamp inicial de la request
   */
  private calculateLatency(request: any): number {
    if (!request.startTime) {
      request.startTime = Date.now();
      return 0;
    }
    return Date.now() - request.startTime;
  }

  /**
   * Generar objeto de respuesta estándar de error
   */
  private generateErrorResponse(message: string): {
    message: string;
    error: string;
    statusCode: number;
  } {
    return {
      message,
      error: 'Forbidden',
      statusCode: 403,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no hay permisos requeridos, permitir (opcional: cambiar a deny si prefieres)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const actor: Actor = request.user;

    if (!actor) {
      this.logger.warn('No actor found in request (missing JwtAuthGuard?)');

      const latency = this.calculateLatency(request);
      const errorResponse = this.generateErrorResponse(
        'Access denied: no actor',
      );

      // Fire-and-forget: Auditar intento de acceso sin actor
      this.auditService.logError(
        'PERMISSION_DENIED',
        'guard',
        'unknown',
        new Error('No actor found in request'),
        {
          module: 'authz',
          severity: 'HIGH',
          tags: ['permission', 'denied', 'no-actor'],
          latency: latency,
          statusCode: errorResponse.statusCode,
          response: errorResponse,
          changes: {
            after: {
              endpoint: `${request.method} ${request.path}`,
              reason: 'No actor found',
            },
          },
        },
      );

      throw new ForbiddenException(errorResponse.message);
    }

    try {
      const actorPermissions =
        await this.PermissionsService.resolvePermissions(actor);

      // Validar que el actor tenga todos los permisos requeridos
      // Soporta: permisos exactos, module.*, y *
      const hasAllPermissions = requiredPermissions.every((perm) =>
        this.PermissionsService.hasPermission(actorPermissions, perm),
      );

      if (!hasAllPermissions) {
        this.logger.warn(
          `Access denied for ${actor.actorType}:${actor.actorId}. Required: ${requiredPermissions.join(', ')}`,
        );

        const latency = this.calculateLatency(request);
        const errorResponse = this.generateErrorResponse(
          'Insufficient permissions',
        );

        // Fire-and-forget: Auditar acceso denegado por permisos insuficientes
        this.auditService.logError(
          'PERMISSION_DENIED',
          'guard',
          actor.actorId,
          new Error(
            `Insufficient permissions: required ${requiredPermissions.join(', ')}`,
          ),
          {
            module: 'authz',
            severity: 'HIGH',
            tags: ['permission', 'denied', 'insufficient-permissions'],
            latency: latency,
            statusCode: errorResponse.statusCode,
            response: errorResponse,
            changes: {
              after: {
                actor: `${actor.actorType}:${actor.actorId}`,
                endpoint: `${request.method} ${request.path}`,
                required: requiredPermissions,
                reason: 'Insufficient permissions',
              },
            },
          },
        );

        throw new ForbiddenException(errorResponse.message);
      }

      return true;
    } catch (error: any) {
      // Si es ForbiddenException, re-lanzar sin modificar
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // Fail-closed: cualquier error en resolución → deny
      this.logger.error(
        `Permission check failed for ${actor.actorType}:${actor.actorId}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      const latency = this.calculateLatency(request);
      const errorResponse = this.generateErrorResponse('Access denied');

      // Fire-and-forget: Auditar error en resolución de permisos
      this.auditService.logError(
        'PERMISSION_DENIED',
        'guard',
        actor.actorId,
        error as Error,
        {
          module: 'authz',
          severity: 'HIGH',
          tags: ['permission', 'denied', 'resolution-error'],
          latency: latency,
          statusCode: errorResponse.statusCode,
          response: errorResponse,
          changes: {
            after: {
              actor: `${actor.actorType}:${actor.actorId}`,
              endpoint: `${request.method} ${request.path}`,
              reason: 'Permission resolution failed',
              error: (error as Error).message,
            },
          },
        },
      );

      throw new ForbiddenException(errorResponse.message);
    }
  }
}
