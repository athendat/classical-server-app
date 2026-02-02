import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/modules/auth/auth.module';
import { AuditModule } from 'src/modules/audit/audit.module';

import { AsyncContextService } from 'src/common/context';
import { CardService } from './application/card.service';
import { Iso4PinblockService } from './infrastructure/services/iso4-pinblock.service';

import { CardController } from './infrastructure/controllers/card.controller';

import { CardVaultAdapter } from './infrastructure/adapters/card-vault.adapter';
import { CardRepository } from './infrastructure/adapters/card.repository';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';

import { Card, CardSchema } from './infrastructure/schemas/card.schema';
import {
  CardLifecycle,
  CardLifecycleSchema,
} from './infrastructure/schemas/card-lifecycle.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Card.name, schema: CardSchema },
      { name: CardLifecycle.name, schema: CardLifecycleSchema },
    ]),
    AuthModule,
    AuditModule,
  ],
  controllers: [CardController],
  providers: [
    AsyncContextService,
    CardService,
    CardRepository,
    Iso4PinblockService,
    {
      provide: INJECTION_TOKENS.CARD_VAULT_ADAPTER,
      useClass: CardVaultAdapter,
    },
  ],
  exports: [CardService, CardRepository],
})
export class CardModule {}
