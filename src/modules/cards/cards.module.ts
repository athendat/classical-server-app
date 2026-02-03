import { Module, } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuditModule } from 'src/modules/audit/audit.module';

import { AsyncContextService } from 'src/common/context';
import { CardsService } from './application/cards.service';
import { Iso4PinblockService } from './infrastructure/services/iso4-pinblock.service';

import { CardController } from './infrastructure/controllers/card.controller';

import { CardVaultAdapter } from './infrastructure/adapters/card-vault.adapter';
import { CardRepository } from './infrastructure/adapters/card.repository';


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
    AuditModule
  ],
  controllers: [CardController],
  providers: [
    AsyncContextService,
    CardsService,
    CardRepository,
    CardVaultAdapter,
    Iso4PinblockService,
  ],
  exports: [CardsService, CardRepository, Iso4PinblockService, MongooseModule],
})
export class CardsModule {}
