import { Injectable, Logger } from '@nestjs/common';

import { CacheService } from 'src/common/cache/cache.service';

export type ConfirmationCodeType = 'confirmation' | 'reset';

interface ValidationResult {
  isValid: boolean;
  attemptsRemaining?: number;
  error?: string;
}

@Injectable()
export class ConfirmationCodeService {
  private readonly logger = new Logger(ConfirmationCodeService.name);
  private readonly CODE_LENGTH = 6;
  private readonly CODE_TTL_SECONDS = 600; // 10 minutos
  private readonly ATTEMPTS_TTL_SECONDS = 600; // 10 minutos
  private readonly RESENDS_TTL_SECONDS = 86400; // 24 horas
  private readonly MAX_ATTEMPTS = 3;
  private readonly MAX_RESENDS = 3;

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Genera un código aleatorio de 6 dígitos y lo almacena en caché
   */
  async generateAndStore(
    phone: string,
    type: ConfirmationCodeType,
  ): Promise<string> {
    const code = this.generateRandomCode();
    const key = this.getCodeKey(phone, type);

    await this.cacheService.set(key, code, this.CODE_TTL_SECONDS);

    this.logger.log(`Generated ${type} code for phone ${phone}: ${code}`);

    return code;
  }

  /**
   * Valida un código de confirmación
   * Incrementa el contador de intentos fallidos
   * Rechaza si se exceden 3 intentos
   */
  async validate(
    phone: string,
    code: string,
    type: ConfirmationCodeType,
  ): Promise<ValidationResult> {
    // Log
    this.logger.log(`Validating ${type} code for phone ${phone}`);

    const codeKey = this.getCodeKey(phone, type);
    this.logger.log(`Code key: ${codeKey}`);

    const attemptsKey = this.getAttemptsKey(phone, type);
    this.logger.log(`Attempts key: ${attemptsKey}`);

    // Obtener código almacenado
    const storedCode = await this.cacheService.getByKey<string>(codeKey);
    this.logger.log(`Stored code: ${storedCode}`);

    if (!storedCode) {
      this.logger.warn(`No ${type} code found for phone ${phone}`);
      return {
        isValid: false,
        error: 'Código expirado o no existe',
      };
    }

    // Obtener intentos actuales
    const currentAttempts =
      await this.cacheService.getByKey<number>(attemptsKey);
    const attempts = currentAttempts || 0;

    // Verificar si se excedieron los intentos
    if (attempts >= this.MAX_ATTEMPTS) {
      this.logger.warn(
        `Max attempts exceeded for ${type} code validation for phone ${phone}`,
      );
      return {
        isValid: false,
        attemptsRemaining: 0,
        error:
          'Demasiados intentos fallidos. Use resend-code para solicitar un nuevo código',
      };
    }

    // Validar código
    if (storedCode !== code) {
      const newAttempts = attempts + 1;
      const attemptsRemaining = this.MAX_ATTEMPTS - newAttempts;

      // Guardar nuevo contador de intentos
      await this.cacheService.set(
        attemptsKey,
        newAttempts,
        this.ATTEMPTS_TTL_SECONDS,
      );

      this.logger.warn(
        `Invalid ${type} code for phone ${phone}. Attempts: ${newAttempts}/${this.MAX_ATTEMPTS}`,
      );

      return {
        isValid: false,
        attemptsRemaining,
        error: `Código inválido. ${attemptsRemaining} intentos restantes`,
      };
    }

    // Código válido
    this.logger.log(`Valid ${type} code for phone ${phone}`);
    return { isValid: true };
  }

  /**
   * Limpia el código y los contadores de intentos tras validación exitosa
   */
  async clear(phone: string, type: ConfirmationCodeType): Promise<void> {
    const codeKey = this.getCodeKey(phone, type);
    const attemptsKey = this.getAttemptsKey(phone, type);

    await this.cacheService.delete(codeKey);
    await this.cacheService.delete(attemptsKey);

    this.logger.log(`Cleared ${type} code and attempts for phone ${phone}`);
  }

  /**
   * Verifica si se puede hacer resend (máximo 3 en 24h)
   * Solo para confirmación de registro
   */
  async canResend(phone: string): Promise<boolean> {
    const resendKey = this.getResendCountKey(phone);
    const resendCount = await this.cacheService.getByKey<number>(resendKey);

    return !resendCount || resendCount < this.MAX_RESENDS;
  }

  /**
   * Obtiene el número de reenvíos restantes en 24h
   */
  async getResendCountRemaining(phone: string): Promise<number> {
    const resendKey = this.getResendCountKey(phone);
    const resendCount = await this.cacheService.getByKey<number>(resendKey);

    return this.MAX_RESENDS - (resendCount || 0);
  }

  /**
   * Incrementa el contador de reenvíos
   */
  async incrementResendCount(phone: string): Promise<void> {
    const resendKey = this.getResendCountKey(phone);
    const currentCount = await this.cacheService.getByKey<number>(resendKey);
    const newCount = (currentCount || 0) + 1;

    await this.cacheService.set(resendKey, newCount, this.RESENDS_TTL_SECONDS);

    this.logger.log(
      `Incremented resend count for phone ${phone}: ${newCount}/${this.MAX_RESENDS}`,
    );
  }

  /**
   * Resetea el contador de intentos de validación
   * Se usa cuando se genera un nuevo código
   */
  async resetAttempts(
    phone: string,
    type: ConfirmationCodeType,
  ): Promise<void> {
    const attemptsKey = this.getAttemptsKey(phone, type);
    await this.cacheService.delete(attemptsKey);

    this.logger.log(`Reset attempts for ${type} code for phone ${phone}`);
  }

  /**
   * Genera un código aleatorio de 6 dígitos
   */
  private generateRandomCode(): string {
    const min = 100000;
    const max = 999999;
    const code = Math.floor(Math.random() * (max - min + 1)) + min;
    return code.toString();
  }

  /**
   * Construye la clave para almacenar el código
   */
  private getCodeKey(phone: string, type: ConfirmationCodeType): string {
    return `${type}:${phone}`;
  }

  /**
   * Construye la clave para almacenar el contador de intentos
   */
  private getAttemptsKey(phone: string, type: ConfirmationCodeType): string {
    return `${type}:attempts:${phone}`;
  }

  /**
   * Construye la clave para almacenar el contador de reenvíos (24h)
   */
  private getResendCountKey(phone: string): string {
    return `confirmation:resends:${phone}`;
  }
}
