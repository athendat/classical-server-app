import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuditModule } from '../audit/audit.module';
import { SharedContextModule } from 'src/shared/shared-context.module';
import { OAuthModule } from '../oauth/oauth.module';

import { AsyncContextService } from 'src/common/context';
import { TerminalService } from './application/terminal.service';

import { AdminTerminalController } from './infrastructure/controllers/admin-terminal.controller';
import { TerminalController } from './infrastructure/controllers/terminal.controller';

import { TerminalRepository } from './infrastructure/repositories/terminal.repository';

import { Terminal, TerminalSchema } from './infrastructure/schemas/terminal.schema';

import { TERMINAL_INJECTION_TOKENS } from './domain/constants/terminal.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Terminal.name, schema: TerminalSchema },
    ]),
    OAuthModule,
    SharedContextModule,
    AuditModule,
  ],
  controllers: [TerminalController, AdminTerminalController],
  providers: [
    AsyncContextService,
    TerminalService,
    {
      provide: TERMINAL_INJECTION_TOKENS.TERMINAL_REPOSITORY,
      useClass: TerminalRepository,
    },
  ],
  exports: [TerminalService],
})
export class TerminalsModule {}
