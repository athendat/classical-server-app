// Nest Modules
import { Module } from '@nestjs/common';

// Modules
import { SmsModule } from './sms/sms.module';
import { HttpModule } from './http/http.module';
import { CryptoModule } from './crypto/crypto.module';
import { EmvcoModule } from './emvco/emvco.module';

@Module({
  imports: [
    EmvcoModule,
    SmsModule,
    HttpModule,
    CryptoModule
  ],
  exports: [
    EmvcoModule,
    SmsModule,
    HttpModule,
    CryptoModule
  ],
})
export class CommonModule { }
