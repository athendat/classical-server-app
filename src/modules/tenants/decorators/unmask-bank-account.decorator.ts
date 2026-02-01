import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { Actor } from 'src/common/interfaces';

/**
 * Decorador que verifica si el usuario tiene permiso para ver datos sensibles (PAN)
 * Requiere que el usuario tenga el scope 'tenants.view-sensitive'
 *e
 * Uso en controlador:
 * @UnmaskBankAccount() actor: Actor
 *
 * Si el usuario NO tiene el permiso, lanza ForbiddenException
 * Si tiene el permiso, retorna el actor autenticado
 */
export const UnmaskBankAccount = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: Actor }>();
    const actor = request.user as Actor;

    if (!actor) {
      throw new ForbiddenException('No actor found in request context');
    }

    // Verificar si el usuario tiene el permiso para ver datos sensibles
    const hasPermission =
      actor.scopes?.includes('tenants.view-sensitive') || false;

    if (!hasPermission) {
      throw new ForbiddenException(
        'Insufficient permissions: tenants.view-sensitive required to view sensitive data',
      );
    }

    return actor;
  },
);
