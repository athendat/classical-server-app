import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

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
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          issuer: configService.get<string>('JWT_ISSUER') || 'classical-api',
          audience:
            configService.get<string>('JWT_AUDIENCE') || 'classical-service',
        },
      }),
    }),
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
