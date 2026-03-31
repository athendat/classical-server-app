import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TerminalService } from './application/terminal.service';
import { TerminalController } from './infrastructure/controllers/terminal.controller';
import { AdminTerminalController } from './infrastructure/controllers/admin-terminal.controller';
import { TerminalRepository } from './infrastructure/repositories/terminal.repository';
import { Terminal, TerminalSchema } from './infrastructure/schemas/terminal.schema';
import { TERMINAL_INJECTION_TOKENS } from './domain/constants/terminal.constants';
import { OAuthModule } from '../oauth/oauth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Terminal.name, schema: TerminalSchema },
    ]),
    OAuthModule,
  ],
  controllers: [TerminalController, AdminTerminalController],
  providers: [
    TerminalService,
    {
      provide: TERMINAL_INJECTION_TOKENS.TERMINAL_REPOSITORY,
      useClass: TerminalRepository,
    },
  ],
  exports: [TerminalService],
})
export class TerminalsModule {}
