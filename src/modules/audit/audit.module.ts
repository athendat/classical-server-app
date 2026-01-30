import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditEvent, AuditEventSchema } from './schemas/audit-event.schema';
import { AuditService } from './application/audit.service';
import { AuditLogService } from './application/audit-log.service';
import { AuditPersistenceAdapter } from './infrastructure/adapters/audit-persistence.adapter';
import { AuditResponseUpdateAdapter } from './infrastructure/adapters/audit-response-update.adapter';
import { AuditController } from './infrastructure/controllers/audit.controller';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditEvent.name, schema: AuditEventSchema },
    ]),
    forwardRef(() => AuthzModule),
  ],
  controllers: [AuditController],
  providers: [
    AsyncContextService,
    AuditService,
    AuditLogService,
    AuditPersistenceAdapter,
    AuditResponseUpdateAdapter,
  ],
  exports: [AuditService],
})
export class AuditModule {}
