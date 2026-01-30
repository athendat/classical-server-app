import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT que valida token y deriva actor.
 * Usa JwtStrategy internamente.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
