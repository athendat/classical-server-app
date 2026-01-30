import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PermissionsGuard } from './guards/permissions.guard';

import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuthzService } from './authz.service';

import { Permission, PermissionSchema } from './schemas/permission.schema';
import { Role, RoleSchema } from './schemas/role.schema';
import { Service, ServiceSchema } from './schemas/service.schema';
import { User, UserSchema } from '../users/infrastructure/schemas/user.schema';

import { AuthzAdapter } from './infrastructure/adapters/authz.adapter';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { AuditModule } from '../audit/audit.module';
import { CachingModule } from 'src/common/cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Permission.name, schema: PermissionSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => AuditModule),
    CachingModule,
  ],
  providers: [
    AsyncContextService,
    AuthzAdapter,
    {
      provide: INJECTION_TOKENS.AUTHZ_SERVICE,
      useClass: AuthzAdapter,
    },
    AuthzService,
    PermissionsGuard,
  ],
  exports: [
    INJECTION_TOKENS.AUTHZ_SERVICE,
    AuthzService,
    PermissionsGuard,
    MongooseModule,
  ],
})
export class AuthzModule {}
