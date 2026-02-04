import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

// Common
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { HttpModule } from '../../common/http/http.module';

// Infrastructure
import { TransactionSchemaFactory } from './infrastructure/schemas/transaction.schema';
import { TransactionSequenceSchema } from './infrastructure/schemas/transaction-sequence.schema';
import { MongoDbSequenceAdapter } from './infrastructure/adapters/sequence.adapter';
import { TransactionsRepository } from './infrastructure/adapters/transactions.repository';
import { TransactionsController } from './infrastructure/controllers/transactions.controller';
import { TransactionExpirationTask } from './infrastructure/tasks/transaction-expiration.task';

// Application
import { AsyncContextService } from 'src/common/context';
import { TransactionService } from './application/services/transaction.service';
import { TransactionQueryService } from './application/services/transaction-query.service';
import { TenantWebhookDispatcher } from './application/services/tenant-webhook.dispatcher';

// Ports
import { Tenant, TenantSchema } from '../tenants/infrastructure/schemas/tenant.schema';
import { TenantsModule } from '../tenants';

@Module({
    imports: [
        AuditModule,
        MongooseModule.forFeature([
            {
                name: 'TransactionSchema',
                schema: TransactionSchemaFactory,
                collection: 'transactions',
            },
            {
                name: 'TransactionSequence',
                schema: TransactionSequenceSchema,
                collection: 'transaction_sequences',
            },
            {
                name: 'Tenant',
                schema: TenantSchema,
                collection: 'tenants',
            },
        ]),
        ScheduleModule.forRoot(),
        CryptoModule,
        HttpModule,
        TenantsModule,
    ],
    controllers: [TransactionsController],
    providers: [

        AsyncContextService,

        // Adapters
        MongoDbSequenceAdapter,
        TransactionsRepository,
        
        // Services
        TransactionService,
        TransactionQueryService,
        TenantWebhookDispatcher,

        // Tasks
        TransactionExpirationTask,
    ],
    exports: [TransactionService, TransactionQueryService],
})
export class TransactionsModule { }
