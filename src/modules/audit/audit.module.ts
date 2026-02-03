import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from './application/audit.service';
import { AuditLogService } from './application/audit-log.service';

import { AuditPersistenceAdapter } from './infrastructure/adapters/audit-persistence.adapter';

import { AuditResponseUpdateAdapter } from './infrastructure/adapters/audit-response-update.adapter';

import { AuditController } from './infrastructure/controllers/audit.controller';

import { AuditEvent, AuditEventSchema } from './schemas/audit-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditEvent.name, schema: AuditEventSchema },
    ]),
  ],
  controllers: [AuditController],
  providers: [
    AsyncContextService,
    AuditService,
    AuditLogService,
    AuditPersistenceAdapter,
    AuditResponseUpdateAdapter,
  ],
  exports: [
    AuditService,
    AuditLogService,
    AuditPersistenceAdapter,
    AuditResponseUpdateAdapter,
    MongooseModule
  ],
})
export class AuditModule { }
