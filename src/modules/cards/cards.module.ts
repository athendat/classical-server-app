import { Module, } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuditModule } from 'src/modules/audit/audit.module';
import { HttpModule } from 'src/common/http/http.module';

import { AsyncContextService } from 'src/common/context';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { CardsService } from './application/cards.service';
import { Iso4PinblockService } from './infrastructure/services/iso4-pinblock.service';

import { CardController } from './infrastructure/controllers/card.controller';

import { CardVaultAdapter } from './infrastructure/adapters/card-vault.adapter';
import { CardsRepository } from './infrastructure/adapters/card.repository';
import { SgtCardAdapter } from './infrastructure/adapters/sgt-card.adapter';


import { Card, CardSchema } from './infrastructure/schemas/card.schema';
import {
  CardLifecycle,
  CardLifecycleSchema,
} from './infrastructure/schemas/card-lifecycle.schema';
import { UsersModule } from '../users/users.module';


@Module({
  imports: [
    AuditModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: Card.name, schema: CardSchema },
      { name: CardLifecycle.name, schema: CardLifecycleSchema },
    ]),
    UsersModule,
  ],
  controllers: [CardController],
  providers: [
    AsyncContextService,
    CardsService,
    CardsRepository,
    CardVaultAdapter,
    Iso4PinblockService,
    {
      provide: INJECTION_TOKENS.CARD_SGT_PORT,
      useClass: SgtCardAdapter,
    },
  ],
  exports: [CardsService, CardsRepository, Iso4PinblockService, MongooseModule],
})
export class CardsModule {}
