// Node Modules
import * as https from 'https';
import * as http from 'http';

// Nest Modules
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpModule as AxiosModule } from '@nestjs/axios';

// Services
import { HttpService } from './http.service';

@Module({
    imports: [
        AxiosModule.registerAsync({
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                timeout: 30000, // 30 segundos global timeout
                maxRedirects: 5,
                headers: {
                    'Content-Type': 'application/json',
                },
                httpAgent: new http.Agent({
                    keepAlive: true,
                }),
                httpsAgent: new https.Agent({
                    keepAlive: true,
                    rejectUnauthorized: false, // Para desarrollo/testing; usar true en producción
                }),
            }),
        })
    ],
    providers: [HttpService],
    exports: [HttpService],
})
export class HttpModule { }
