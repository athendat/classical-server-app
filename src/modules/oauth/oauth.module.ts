import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { OAuthService } from './application/oauth.service';
import { OAuthController } from './infrastructure/controllers/oauth.controller';
import { OAuthClientRepository } from './infrastructure/repositories/oauth-client.repository';
import { OAuthClient, OAuthClientSchema } from './infrastructure/schemas/oauth-client.schema';
import { OAUTH_INJECTION_TOKENS } from './domain/constants/oauth.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OAuthClient.name, schema: OAuthClientSchema },
    ]),
    AuthModule,
  ],
  controllers: [OAuthController],
  providers: [
    OAuthService,
    {
      provide: OAUTH_INJECTION_TOKENS.OAUTH_CLIENT_REPOSITORY,
      useClass: OAuthClientRepository,
    },
  ],
  exports: [OAuthService],
})
export class OAuthModule {}
