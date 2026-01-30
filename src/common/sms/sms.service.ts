// Nest Modules
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

// Services
import { HttpService } from '../http/http.service';
import { UserRegisteredEvent } from 'src/modules/auth/events/auth.events';

@Injectable()
export class SmsService {
  // Private properties
  #logger = new Logger(SmsService.name);

  /**
   * Constructor
   */
  constructor(
    private readonly _configService: ConfigService,
    private readonly _httpService: HttpService,
  ) {}

  // -----------------------------------------------------------------------------------------------------
  // @ public methods for resolver
  // -----------------------------------------------------------------------------------------------------

  /**
   * Enviar código de verificación
   *
   * @param user
   */
  async sendSMS(
    username: string,
    phone: string,
    mstext: string,
  ): Promise<void> {
    // Log de seguimiento
    this.#logger.log(`[SmsService] Sending sms to ${username}, phone ${phone}`);

    // Obtener url de la API de SMS y el token de autenticación
    const url = this._configService.get<string>('SMS_API_URL')!;
    const token = this._configService.get<string>('SMS_TOKEN')!;

    // Construir configuración de la solicitud
    const config = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };

    // Construir cuerpo de la solicitud
    const body = {
      recipient: `53${phone}`,
      mstext,
    };

    // Enviar el mensaje
    await this._httpService.post(url, body, config);
  }

  @OnEvent('user.registered', { async: true })
  async handleUserRegisteredEvent({
    username,
    phone,
    code,
  }: UserRegisteredEvent) {
    this.#logger.debug(
      `[SmsService] Processing user.registered event for username: ${username}, phone: ${phone}`,
    );

    // Obtener nombre de la aplicación de las variables de entorno
    const appName = this._configService.get<string>('APP_NAME')!;

    // Crear el mensaje
    const mstext = `Hola ${username}, bienvenido a ${appName}. Tu código de verificación es: ${code}`;

    // Enviar sms con el código de verificación
    await this.sendSMS(username, phone, mstext);
  }

  @OnEvent('user.password_reset_requested', { async: true })
  async handleUserPasswordResetRequestedEvent({
    username,
    phone,
    code,
  }: UserRegisteredEvent) {
    this.#logger.debug(
      `[SmsService] Processing user.password_reset_requested event for username: ${username}, phone: ${phone}`,
    );

    // Crear el mensaje
    const mstext = `Hola ${username}, su código de recuperación es: ${code}`;

    // Enviar sms con el código de verificación
    await this.sendSMS(username, phone, mstext);
  }
}
