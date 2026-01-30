import { Module, Global } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwksAdapter } from './infrastructure/adapters/jwks.adapter';
import { JwtTokenAdapter } from './infrastructure/adapters/jwt-token.adapter';
import { ReplayProtectionAdapter } from './infrastructure/adapters/replay-protection.adapter';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { AuthService } from './application/auth.service';

import { VaultModule } from '../vault/vault.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { AsyncContextService } from 'src/common/context/async-context.service';

/**
 * Módulo de autenticación.
 * - Proporciona generación y validación de JWT con RS256 + JWKS.
 * - Soporta rotación automática de claves.
 * - Implementa anti-replay con validación de jti.
 * - Integra con Vault para custodia de claves privadas.
 * - Integra con UsersModule para validación de credenciales.
 *
 * Exports:
 * - IJwtTokenPort: para generar y validar tokens
 * - IJwksPort: para gestión de claves
 * - IReplayProtectionPort: para validación anti-replay
 */
@Global()
@Module({
  imports: [PassportModule, VaultModule, UsersModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AsyncContextService,
    AuthService,
    JwtStrategy,
    {
      provide: 'IJwksPort',
      useClass: JwksAdapter,
    },
    {
      provide: 'IReplayProtectionPort',
      useClass: ReplayProtectionAdapter,
    },
    {
      provide: 'IJwtTokenPort',
      useClass: JwtTokenAdapter,
    },
  ],
  exports: [
    PassportModule,
    AuthService,
    'IJwksPort',
    'IReplayProtectionPort',
    'IJwtTokenPort',
  ],
})
export class AuthModule {}
