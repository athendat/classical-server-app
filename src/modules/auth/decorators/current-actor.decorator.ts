import { Request } from 'express';

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { Actor } from 'src/common/interfaces';

/**
 * Decorator para inyectar el actor autenticado en controllers.
 * Uso: @CurrentActor() actor: Actor
 */
export const CurrentActor = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: Actor }>();
    return request.user as Actor;
  },
);
