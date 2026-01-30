import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { HttpModule } from '../http/http.module';

import { SmsService } from './sms.service';

@Module({
  imports: [EventEmitter2, HttpModule],
  providers: [ConfigService, SmsService],
})
export class SmsModule {}
