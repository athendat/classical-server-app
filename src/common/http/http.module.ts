// Node Modules
import * as https from 'https';

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
                timeout: 65000,
                maxRedirects: 5,
                headers: {
                    'Content-Type': 'application/json',
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false, // Opción para ignorar errores de certificados no válidos (no recomendado en producción)
                    // key: fs.readFileSync('path/to/private-key.pem'), // Si necesitas un certificado cliente
                    // cert: fs.readFileSync('path/to/certificate.pem'), // Si necesitas un certificado cliente
                }),
            }),
        })
    ],
    providers: [HttpService],
    exports: [HttpService],
})
export class HttpModule { }
