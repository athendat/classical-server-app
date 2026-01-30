// Nest Modules
import { Module } from '@nestjs/common';

// Modules
import { SmsModule } from './sms/sms.module';
import { HttpModule } from './http/http.module';

@Module({
  imports: [SmsModule, HttpModule],
  exports: [SmsModule, HttpModule],
})
export class CommonModule {}
