import {
  Injectable,
  BadRequestException,
  Logger,
  Inject,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from '../../audit/application/audit.service';
import { UsersService } from '../../users/application/users.service';
import { SessionService } from '../infrastructure/services/session.service';

import type { IJwtTokenPort } from '../domain/ports/jwt-token.port';
import type { UserDTO } from '../../users/domain/ports/users.port';

import {
  LoginDto,
  LoginResponseDto,
  RegisterDto,
  RegisterResponseDto,
  ConfirmPhoneDto,
  ConfirmPhoneResponseDto,
  ResendCodeDto,
  ResendCodeResponseDto,
  ForgotPasswordDto,
  ForgotPasswordResponseDto,
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from '../dto';

// ⭐ NUEVO: Import MerchantRegistrationDto
import { MerchantRegistrationDto } from '../dto/merchant-registration.dto';
import { ServiceLoginDto } from '../dto/service-login.dto';

import { ApiResponse } from 'src/common/types/api-response.type';
import { ConfirmationCodeService } from '../infrastructure/services/confirmation-code.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRegisteredEvent } from '../events/auth.events';
import { CardsService } from 'src/modules/cards/application/cards.service';
import { PermissionsService } from '../../permissions/application/permissions.service';
import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';

interface ValidationResponse {
  valid: boolean;
  user?: UserDTO;
  reason?: 'PHONE_NOT_CONFIRMED';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtAudience: string;
  private readonly jwtIssuer: string;

  constructor(
    @Inject('IJwtTokenPort')
    private readonly jwtTokenPort: IJwtTokenPort,
    private readonly asyncContext: AsyncContextService,
    private readonly auditService: AuditService,
    private readonly cardsService: CardsService,
    private readonly configService: ConfigService,
    private readonly confirmationCodeService: ConfirmationCodeService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionsService: PermissionsService,
    private readonly sessionService: SessionService,
    private readonly usersService: UsersService,
    private readonly tenantsRepository: TenantsRepository,
  ) {
    this.jwtAudience =
      configService.get<string>('JWT_AUDIENCE') || 'classical-service';
    this.jwtIssuer = configService.get<string>('JWT_ISSUER') || 'classical-api';
  }

  /**
   * Iniciar sesión
   * @param loginDto
   */
  async login(loginDto: LoginDto): Promise<ApiResponse<LoginResponseDto>> {
    const { username, password } = loginDto;
    const requestId = this.asyncContext.getRequestId();

    try {
      const validation: ValidationResponse = await this.validateCredentials(
        username,
        password,
      );
      if (!validation.valid) {
        // Manejar caso especial: teléfono no confirmado
        if (validation.reason === 'PHONE_NOT_CONFIRMED') {
          this.auditService.logDeny(
            'AUTH_LOGIN',
            'user',
            username,
            'Phone not confirmed',
            {
              severity: 'MEDIUM',
              tags: ['authentication', 'failed-login', 'phone-not-confirmed'],
            },
          );

          this.logger.warn(
            `Login attempt with unconfirmed phone for user: ${username}, requestId: ${requestId}`,
          );
          return ApiResponse.fail<LoginResponseDto>(
            HttpStatus.UNAUTHORIZED,
            'Teléfono no confirmado',
            'Por favor confirme su teléfono antes de continuar',
            { requestId },
          );
        }

        // Registrar intento fallido de login (no-bloqueante)
        this.auditService.logDeny(
          'AUTH_LOGIN',
          'user',
          username,
          'Invalid credentials provided',
          {
            severity: 'MEDIUM',
            tags: ['authentication', 'failed-login', 'invalid-credentials'],
          },
        );

        this.logger.warn(
          `Failed login attempt for user: ${username}, requestId: ${requestId}`,
        );
        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.BAD_REQUEST,
          'Failed login attempt',
          'Invalid credentials',
          { requestId },
        );
      }

      // Generar token de acceso
      const userId = validation.user?.id || username;
      const jwtPayload = {
        sub: `user:${userId}`,
        iss: this.jwtIssuer,
        aud: this.jwtAudience,
        scope: 'read write',
        expiresIn: 3600, // 1 hora
        // ⭐ NUEVO: Incluir información de roles en JWT
        roleKey: validation.user?.roleKey,
        additionalRoleKeys: validation.user?.additionalRoleKeys || [],
        // tenantId se incluirá aquí en el futuro cuando esté implementado
      };

      const accessResult = await this.jwtTokenPort.sign(jwtPayload);
      if (!accessResult.isSuccess) {
        this.auditService.logError(
          'AUTH_LOGIN',
          'user',
          userId,
          {
            code: 'TOKEN_GENERATION_FAILED',
            message: 'Failed to generate access token',
          },
          {
            severity: 'CRITICAL',
            tags: ['authentication', 'token-generation-failed'],
          },
        );
        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Failed to generate access token',
          'Token generation error',
          { requestId },
        );
      }

      // Generar token de refresco
      const refreshPayload = {
        sub: `user:${validation.user?.id}`,
        iss: this.jwtIssuer,
        aud: this.jwtAudience,
        scope: 'refresh',
        expiresIn: 604800, // 7 días
        type: 'refresh',
      };

      const refreshResult = await this.jwtTokenPort.sign(refreshPayload);
      const refreshToken = refreshResult.isSuccess
        ? refreshResult.getValue()
        : undefined;

      // Registrar login exitoso (no-bloqueante)
      this.auditService.logAllow('AUTH_LOGIN', 'user', userId, {
        severity: 'HIGH',
        tags: ['authentication', 'successful-login', 'token-generated'],
        changes: {
          after: {
            userId,
            timestamp: new Date().toISOString(),
            tokenType: 'Bearer',
          },
        },
      });

      this.logger.log(
        `User ${userId} logged in successfully, requestId: ${requestId}`,
      );

      // Guardar sesión en caché con TTL = tiempo de vida del refresh token (7 días = 604800 segundos)
      const refreshTokenTtl = 604800; // 7 días
      await this.sessionService.saveSession(
        userId,
        {
          userId,
          user: validation.user!,
          loginTimestamp: new Date().toISOString(),
          accessToken: accessResult.getValue(),
          refreshToken: refreshToken || '',
          tokenType: 'Bearer',
          accessTokenExpiresIn: 3600,
        },
        refreshTokenTtl,
      );

      // Obterner tarjetas del usuario
      const cardsData = await this.cardsService.listCardsForUser(validation.user!.id);

      return ApiResponse.ok<LoginResponseDto>(
        HttpStatus.OK,
        {
          access_token: accessResult.getValue(),
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: refreshToken,
        },
        'Login exitoso',
        {
          requestId,
          user: validation.user,
          cards: cardsData.data
        },
      );
    } catch (error) {
      // Si ya se registró la auditoría en las condiciones anteriores, no duplicar
      if (
        !(error instanceof BadRequestException) &&
        error.message !== 'Failed to generate access token'
      ) {
        this.auditService.logError(
          'AUTH_LOGIN',
          'user',
          username,
          error instanceof Error ? error : new Error(String(error)),
          {
            severity: 'CRITICAL',
            tags: ['authentication', 'login-error'],
          },
        );
      }

      this.logger.error(`Login failed for user ${username}:`, error);
      return ApiResponse.fail<LoginResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to generate tokens',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * Renovar token de acceso
   * @param refreshToken
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<ApiResponse<LoginResponseDto>> {
    const requestId = this.asyncContext.getRequestId();

    try {
      // Validar el refresh token
      const verifyResult = await this.jwtTokenPort.verify(refreshToken);

      if (!verifyResult.isSuccess) {
        // Registrar intento fallido de refresh (no-bloqueante)
        const error = verifyResult.getError() as Error & { message?: string };
        const errorMessage = error?.message || 'Unknown error';

        this.auditService.logDeny(
          'AUTH_REFRESH_TOKEN',
          'token',
          'refresh_token',
          `Invalid or expired refresh token: ${errorMessage}`,
          {
            severity: 'MEDIUM',
            tags: ['authentication', 'token-refresh-failed', 'invalid-token'],
          },
        );

        this.logger.warn(
          `Failed token refresh attempt: ${errorMessage}, requestId: ${requestId}`,
        );

        // Proporcionar mensaje más descriptivo dependiendo del tipo de error
        const isIssuerError = errorMessage.toLowerCase().includes('issuer');
        const userMessage = isIssuerError
          ? 'El token de refresco no es válido. Por favor, inicie sesión nuevamente.'
          : 'Token de refresco inválido o expirado';

        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.BAD_REQUEST,
          userMessage,
          errorMessage,
          { requestId },
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload = verifyResult.getValue();
      
      // Validar que sea un refresh token
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const tokenType = payload.type;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const scope = payload.scope;
      
      // Aceptar si tiene type: 'refresh' O scope: 'refresh'
      const isRefreshToken = (typeof tokenType === 'string' && tokenType === 'refresh') ||
                             (typeof scope === 'string' && scope === 'refresh');
      
      if (!isRefreshToken) {
        const tokenTypeValue = tokenType || scope || 'unknown';
        this.auditService.logDeny(
          'AUTH_REFRESH_TOKEN',
          'token',
          'refresh_token',
          `Invalid token type - expected refresh token, got: ${tokenTypeValue}`,
          {
            severity: 'HIGH',
            tags: [
              'authentication',
              'token-refresh-failed',
              'invalid-token-type',
            ],
          },
        );

        this.logger.warn(
          `Token refresh attempted with invalid token type (${tokenTypeValue}), requestId: ${requestId}`,
        );
        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.BAD_REQUEST,
          'El token enviado no es un token de refresco válido. Por favor, inicie sesión nuevamente.',
          'Invalid token type - expected refresh token',
          { requestId },
        );
      }

      // Generar nuevo access token
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const sub = payload.sub;
      // Extraer userId del formato "user:userId"
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const userId = typeof sub === 'string' ? sub.split(':')[1] : sub;

      const newPayload = {
        sub,
        iss: this.jwtIssuer,
        aud: this.jwtAudience,
        scope: 'read write',
        expiresIn: 3600,
      };

      const newTokenResult = await this.jwtTokenPort.sign(newPayload);
      if (!newTokenResult.isSuccess) {
        this.auditService.logError(
          'AUTH_REFRESH_TOKEN',
          'token',
          'refresh_token',
          {
            code: 'TOKEN_GENERATION_FAILED',
            message: 'Failed to generate new access token during refresh',
          },
          {
            severity: 'CRITICAL',
            tags: [
              'authentication',
              'token-refresh-failed',
              'token-generation-failed',
            ],
          },
        );
        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Failed to generate access token',
          'Token generation error',
          { requestId },
        );
      }

      // Registrar refresh exitoso (no-bloqueante)
      this.auditService.logAllow(
        'AUTH_REFRESH_TOKEN',
        'token',
        'refresh_token',
        {
          severity: 'MEDIUM',
          tags: ['authentication', 'token-refreshed', 'successful-refresh'],
          changes: {
            after: {
              subject: sub,
              timestamp: new Date().toISOString(),
              newTokenGenerated: true,
            },
          },
        },
      );

      this.logger.log(
        `Token refreshed successfully for subject ${sub}, requestId: ${requestId}`,
      );

      // Actualizar sesión en caché con nuevo access token y TTL = tiempo de vida del refresh token (7 días)
      const refreshTokenTtl = 604800; // 7 días
      await this.sessionService.updateSession(
        userId,
        {
          accessToken: newTokenResult.getValue(),
        },
        refreshTokenTtl,
      );

      return ApiResponse.ok<LoginResponseDto>(
        HttpStatus.OK,
        {
          access_token: newTokenResult.getValue(),
          token_type: 'Bearer',
          expires_in: 3600,
        },
        'Token refreshed successfully',
        { requestId },
      );
    } catch (error) {
      // Si ya se registró en las condiciones anteriores, no duplicar
      if (
        !(error instanceof BadRequestException) &&
        error.message !== 'Failed to generate access token'
      ) {
        this.auditService.logError(
          'AUTH_REFRESH_TOKEN',
          'token',
          'refresh_token',
          error instanceof Error ? error : new Error(String(error)),
          {
            severity: 'CRITICAL',
            tags: ['authentication', 'token-refresh-error'],
          },
        );
      }

      this.logger.error('Token refresh failed:', error);
      return ApiResponse.fail<LoginResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to refresh token',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * Registrar nuevo usuario como cliente (rol: 'user')
   * @param registerDto
   */
  async register(
    registerDto: RegisterDto,
  ): Promise<ApiResponse<RegisterResponseDto>> {
    const { phone, password, fullname, idNumber } = registerDto;
    const requestId = this.asyncContext.getRequestId();

    try {
      // Verificar si el phone ya existe y está confirmado
      const response = await this.usersService.findByPhone(phone);
      const existingUser = response.data;
      if (existingUser && existingUser.phoneConfirmed) {
        this.auditService.logDeny(
          'AUTH_REGISTER',
          'user',
          phone,
          'Phone already registered and confirmed',
          {
            severity: 'MEDIUM',
            tags: ['authentication', 'registration-failed', 'phone-exists'],
          },
        );

        return ApiResponse.fail<RegisterResponseDto>(
          HttpStatus.BAD_REQUEST,
          'El teléfono ya está registrado',
          'Phone already registered',
          { requestId },
        );
      }

      // Si el usuario existe pero no está confirmado, actualizar contraseña
      if (existingUser && !existingUser.phoneConfirmed) {
        await this.usersService.updatePasswordByPhone(phone, password);
        this.logger.debug(
          `Updated password for unconfirmed user: ${phone}, requestId: ${requestId}`,
        );
      } else {
        // Crear nuevo usuario con roleKey: 'user' + additionalRoleKeys: []
        const { data } = await this.usersService.create({
          phone,
          password,
          fullname,
          idNumber,
          roleKey: 'user',
        });

        this.logger.debug(
          `Created new user: ${phone}, requestId: ${requestId}`,
        );

        // Generar código de confirmación
        const code = await this.confirmationCodeService.generateAndStore(
          phone,
          'confirmation',
        );

        // Emitir evento para enviar código sms
        await this.eventEmitter.emitAsync(
          'user.registered',
          new UserRegisteredEvent(
            data!.fullname.split(' ')[0],
            data!.phone,
            code,
          ),
        );
      }

      // Registrar registro exitoso
      this.auditService.logAllow('AUTH_REGISTER', 'user', phone, {
        severity: 'HIGH',
        tags: ['authentication', 'registration', 'code-generated'],
        changes: {
          after: {
            phone,
            phoneConfirmed: false,
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.logger.log(
        `User registered successfully: ${phone}, requestId: ${requestId}`,
      );

      return ApiResponse.ok<RegisterResponseDto>(
        HttpStatus.CREATED,
        {
          message: 'Código de confirmación enviado al SMS',
          requestId,
        },
        'Registro exitoso. Código de confirmación enviado al SMS',
        { requestId },
      );
    } catch (error) {
      this.auditService.logError(
        'AUTH_REGISTER',
        'user',
        phone,
        error instanceof Error ? error : new Error(String(error)),
        {
          severity: 'CRITICAL',
          tags: ['authentication', 'registration-error'],
        },
      );

      this.logger.error(`Registration failed for phone ${phone}:`, error);
      return ApiResponse.fail<RegisterResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error en el registro',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * ⭐ NUEVO: Registrar nuevo usuario como comerciante
   * Crea usuario con roleKey: 'user' + additionalRoleKeys: ['merchant']
   * O si existe como user, agrega 'merchant' a additionalRoleKeys
   *
   * Validaciones:
   * - Email debe ser único
   * - Si usuario existe, su rol no puede ser super_admin, admin, u ops (409)
   * - Phone debe ser validado
   *
   * @param merchantRegistrationDto
   */
  async registerMerchant(
    merchantRegistrationDto: MerchantRegistrationDto,
  ): Promise<ApiResponse<RegisterResponseDto>> {
    const { phone, email, password, fullname, idNumber } =
      merchantRegistrationDto;
    const requestId = this.asyncContext.getRequestId();

    try {
      // 1. Validar que email sea único en plataforma
      const emailCheckResponse = await this.usersService.findByEmail(email);
      const emailExists = emailCheckResponse.data;
      if (emailExists && emailExists.id) {
        // Email ya existe en otro usuario
        this.auditService.logDeny(
          'MERCHANT_REGISTRATION',
          'user',
          phone,
          'Email already registered',
          {
            severity: 'MEDIUM',
            tags: ['authentication', 'merchant-registration-failed', 'email-exists'],
          },
        );

        return ApiResponse.fail<RegisterResponseDto>(
          HttpStatus.CONFLICT,
          'El email ya está registrado',
          'Email already in use',
          { requestId },
        );
      }

      // 2. Buscar usuario por phone
      const phoneResponse = await this.usersService.findByPhone(phone);
      const existingUser = phoneResponse.data;

      if (existingUser) {
        // 2a. Si existe y ya tiene rol administrativo → rechazar 409
        if (['super_admin', 'admin', 'ops'].includes(existingUser.roleKey)) {
          this.auditService.logDeny(
            'MERCHANT_REGISTRATION',
            'user',
            phone,
            'Administrative user cannot be a merchant',
            {
              severity: 'MEDIUM',
              tags: [
                'authentication',
                'merchant-registration-failed',
                'admin-user',
              ],
            },
          );

          return ApiResponse.fail<RegisterResponseDto>(
            HttpStatus.CONFLICT,
            'Los usuarios administrativos no pueden ser comerciantes',
            'Administrative user cannot be a merchant',
            { requestId },
          );
        }

        // 2b. Si existe como 'user' → agregar 'merchant' a additionalRoleKeys
        if (existingUser.roleKey === 'user') {
          // Validar que no tenga ya el rol merchant
          const additionalRoles = existingUser.additionalRoleKeys || [];
          if (!additionalRoles.includes('merchant')) {
            // Agregar merchant a additionalRoleKeys
            const updatedAdditionalRoles = [...additionalRoles, 'merchant'];

            // Validar combinación de roles
            const validation = this.permissionsService.validateRoleCombination(
              existingUser.roleKey,
              updatedAdditionalRoles,
            );
            if (!validation.valid) {
              this.auditService.logDeny(
                'MERCHANT_REGISTRATION',
                'user',
                phone,
                `Invalid role combination: ${validation.error}`,
                {
                  severity: 'MEDIUM',
                  tags: [
                    'authentication',
                    'merchant-registration-failed',
                    'invalid-role-combo',
                  ],
                },
              );

              return ApiResponse.fail<RegisterResponseDto>(
                HttpStatus.BAD_REQUEST,
                validation.error || 'Combinación de roles inválida',
                'Invalid role combination',
                { requestId },
              );
            }

            // Actualizar usuario con merchant en additionalRoleKeys
            const updateResponse = await this.usersService.updateRoles(
              existingUser.id,
              {
                roleKey: existingUser.roleKey,
                additionalRoleKeys: updatedAdditionalRoles,
              },
            );

            if (!updateResponse.ok) {
              return updateResponse as unknown as ApiResponse<RegisterResponseDto>;
            }

            // Registrar en auditoría el cambio
            this.auditService.logAllow(
              'MERCHANT_REGISTRATION',
              'user',
              phone,
              {
                severity: 'HIGH',
                tags: ['authentication', 'merchant-added', 'existing-user'],
                changes: {
                  before: {
                    additionalRoleKeys: additionalRoles,
                  },
                  after: {
                    additionalRoleKeys: updatedAdditionalRoles,
                  },
                },
              },
            );

            this.logger.log(
              `Merchant role added to existing user: ${phone}, requestId: ${requestId}`,
            );
          }
        }
      } else {
        // 3. Crear nuevo usuario como user + merchant
        const { data } = await this.usersService.create({
          phone,
          email,
          password,
          fullname,
          idNumber,
          roleKey: 'user',
          additionalRoleKeys: ['merchant'], // ⭐ NUEVO: Usuario como comerciante
        });

        this.logger.debug(
          `Created new merchant user: ${phone}, requestId: ${requestId}`,
        );

        // Generar código de confirmación SMS
        const code = await this.confirmationCodeService.generateAndStore(
          phone,
          'confirmation',
        );

        // Emitir evento para enviar código SMS
        await this.eventEmitter.emitAsync(
          'user.registered',
          new UserRegisteredEvent(
            data!.fullname.split(' ')[0],
            data!.phone,
            code,
          ),
        );
      }

      // Registrar merchant registration exitoso
      this.auditService.logAllow('MERCHANT_REGISTRATION', 'user', phone, {
        severity: 'HIGH',
        tags: ['authentication', 'merchant-registration', 'code-generated'],
        changes: {
          after: {
            phone,
            email,
            roleKey: 'user',
            additionalRoleKeys: ['merchant'],
            phoneConfirmed: false,
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.logger.log(
        `Merchant registered successfully: ${phone}, requestId: ${requestId}`,
      );

      return ApiResponse.ok<RegisterResponseDto>(
        HttpStatus.CREATED,
        {
          message: 'Registro de comerciante exitoso. Código de confirmación enviado al SMS',
          requestId,
        },
        'Registro de comerciante exitoso',
        { requestId },
      );
    } catch (error) {
      this.auditService.logError(
        'MERCHANT_REGISTRATION',
        'user',
        phone,
        error instanceof Error ? error : new Error(String(error)),
        {
          severity: 'CRITICAL',
          tags: ['authentication', 'merchant-registration-error'],
        },
      );

      this.logger.error(
        `Merchant registration failed for phone ${phone}:`,
        error,
      );
      return ApiResponse.fail<RegisterResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error en el registro de comerciante',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * Confirmar teléfono
   * @param confirmPhoneDto
   */
  async confirmPhone(
    confirmPhoneDto: ConfirmPhoneDto,
  ): Promise<ApiResponse<ConfirmPhoneResponseDto>> {
    const { phone, confirmationCode } = confirmPhoneDto;
    const requestId = this.asyncContext.getRequestId();

    // Log de inicio del proceso
    this.logger.debug(
      `Starting phone confirmation process for phone ${phone}, requestId: ${requestId}`,
    );

    try {
      // Validar código
      const validationResult = await this.confirmationCodeService.validate(
        phone,
        confirmationCode,
        'confirmation',
      );

      this.logger.debug(
        `[FASE 1] Validation result: ${JSON.stringify(validationResult)}`,
      );

      if (!validationResult.isValid) {
        // Si se agotaron los intentos
        if (validationResult.attemptsRemaining === 0) {
          this.auditService.logDeny(
            'AUTH_CONFIRM_PHONE',
            'user',
            phone,
            'Max confirmation attempts exceeded',
            {
              severity: 'MEDIUM',
              tags: [
                'authentication',
                'phone-confirmation-failed',
                'max-attempts-exceeded',
              ],
            },
          );

          return ApiResponse.fail<ConfirmPhoneResponseDto>(
            HttpStatus.BAD_REQUEST,
            'Demasiados intentos fallidos. Use resend-code para solicitar un nuevo código',
            'Max attempts exceeded',
            { requestId },
          );
        }

        // Código inválido
        this.auditService.logDeny(
          'AUTH_CONFIRM_PHONE',
          'user',
          phone,
          'Invalid confirmation code',
          {
            severity: 'LOW',
            tags: [
              'authentication',
              'phone-confirmation-failed',
              'invalid-code',
            ],
          },
        );

        return ApiResponse.fail<ConfirmPhoneResponseDto>(
          HttpStatus.BAD_REQUEST,
          validationResult.error || 'Código inválido',
          'Invalid confirmation code',
          { requestId },
        );
      }

      // Buscar usuario
      const response = await this.usersService.findByPhone(phone);
      const user = response.data;
      if (!user) {
        return ApiResponse.fail<ConfirmPhoneResponseDto>(
          HttpStatus.BAD_REQUEST,
          'Usuario no encontrado',
          'User not found',
          { requestId },
        );
      }

      // Marcar teléfono como confirmado
      await this.usersService.markPhoneConfirmed(user.id);

      // Limpiar código y contadores
      await this.confirmationCodeService.clear(phone, 'confirmation');

      // Registrar confirmación exitosa
      this.auditService.logAllow('AUTH_CONFIRM_PHONE', 'user', phone, {
        severity: 'HIGH',
        tags: ['authentication', 'phone-confirmed', 'successful-confirmation'],
        changes: {
          after: {
            phone,
            phoneConfirmed: true,
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.logger.log(
        `Phone confirmed successfully for user: ${phone}, requestId: ${requestId}`,
      );

      return ApiResponse.ok<ConfirmPhoneResponseDto>(
        HttpStatus.OK,
        {
          message: 'Teléfono confirmado exitosamente',
          requestId,
        },
        'Confirmación exitosa',
        { requestId },
      );
    } catch (error) {
      this.auditService.logError(
        'AUTH_CONFIRM_PHONE',
        'user',
        phone,
        error instanceof Error ? error : new Error(String(error)),
        {
          severity: 'CRITICAL',
          tags: ['authentication', 'phone-confirmation-error'],
        },
      );

      this.logger.error(`Phone confirmation failed for ${phone}:`, error);
      return ApiResponse.fail<ConfirmPhoneResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error en la confirmación',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * Reenviar código de confirmación
   * @param resendCodeDto
   */
  async resendCode(
    resendCodeDto: ResendCodeDto,
  ): Promise<ApiResponse<ResendCodeResponseDto>> {
    const { phone } = resendCodeDto;
    const requestId = this.asyncContext.getRequestId();

    try {
      // Verificar que el usuario existe y no está confirmado
      const response = await this.usersService.findByPhone(phone);
      const user = response.data;
      if (!user || user.phoneConfirmed) {
        this.auditService.logDeny(
          'AUTH_RESEND_CODE',
          'user',
          phone,
          'User not found or already confirmed',
          {
            severity: 'LOW',
            tags: ['authentication', 'resend-code-failed', 'user-not-found'],
          },
        );

        // No revelar si el usuario existe
        return ApiResponse.fail<ResendCodeResponseDto>(
          HttpStatus.BAD_REQUEST,
          'Usuario no encontrado o ya confirmado',
          'User not found or already confirmed',
          { requestId },
        );
      }

      // Verificar si se puede hacer resend (máximo 3 en 24h)
      const canResend = await this.confirmationCodeService.canResend(phone);
      if (!canResend) {
        this.auditService.logDeny(
          'AUTH_RESEND_CODE',
          'user',
          phone,
          'Resend limit exceeded (3 in 24h)',
          {
            severity: 'MEDIUM',
            tags: ['authentication', 'resend-code-failed', 'limit-exceeded'],
          },
        );

        return ApiResponse.fail<ResendCodeResponseDto>(
          HttpStatus.TOO_MANY_REQUESTS,
          'Límite de reenvíos alcanzado. Intente en 24 horas',
          'Resend limit exceeded',
          { requestId },
        );
      }

      // Generar nuevo código
      await this.confirmationCodeService.generateAndStore(
        phone,
        'confirmation',
      );

      // Resetear intentos de validación
      await this.confirmationCodeService.resetAttempts(phone, 'confirmation');

      // Incrementar contador de reenvíos
      await this.confirmationCodeService.incrementResendCount(phone);

      // Obtener reenvíos restantes
      const resendCountRemaining =
        await this.confirmationCodeService.getResendCountRemaining(phone);

      // Registrar resend exitoso
      this.auditService.logAllow('AUTH_RESEND_CODE', 'user', phone, {
        severity: 'MEDIUM',
        tags: ['authentication', 'code-resent', 'successful-resend'],
        changes: {
          after: {
            phone,
            resendCount: 3 - resendCountRemaining,
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.logger.log(
        `Code resent successfully for user: ${phone}, requestId: ${requestId}`,
      );

      return ApiResponse.ok<ResendCodeResponseDto>(
        HttpStatus.OK,
        {
          message: `Nuevo código enviado (${resendCountRemaining} reenvíos restantes)`,
          requestId,
          resendCountRemaining,
        },
        'Código reenviado',
        { requestId },
      );
    } catch (error) {
      this.auditService.logError(
        'AUTH_RESEND_CODE',
        'user',
        phone,
        error instanceof Error ? error : new Error(String(error)),
        {
          severity: 'CRITICAL',
          tags: ['authentication', 'resend-code-error'],
        },
      );

      this.logger.error(`Resend code failed for ${phone}:`, error);
      return ApiResponse.fail<ResendCodeResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error al reenviar código',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * Solicitar código de recuperación de contraseña
   * @param forgotPasswordDto
   */
  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<ApiResponse<ForgotPasswordResponseDto>> {
    const { phone } = forgotPasswordDto;
    const requestId = this.asyncContext.getRequestId();

    try {
      // Verificar que el usuario existe y está confirmado
      const response = await this.usersService.findByPhone(phone);
      const user = response.data;
      if (user && user.phoneConfirmed) {
        // Generar reset code
        const code = await this.confirmationCodeService.generateAndStore(
          phone,
          'reset',
        );

        // Emitir evento para enviar código sms
        await this.eventEmitter.emitAsync(
          'user.password_reset_requested',
          new UserRegisteredEvent(
            user.fullname.split(' ')[0],
            user.phone,
            code,
          ),
        );

        // Registrar forgot password exitoso
        this.auditService.logAllow('AUTH_FORGOT_PASSWORD', 'user', phone, {
          severity: 'MEDIUM',
          tags: [
            'authentication',
            'password-reset-requested',
            'code-generated',
          ],
          changes: {
            after: {
              phone,
              resetCodeGenerated: true,
              timestamp: new Date().toISOString(),
            },
          },
        });

        this.logger.log(
          `Forgot password code generated for user: ${phone}, requestId: ${requestId}`,
        );
      } else {
        // Registrar intento con usuario no encontrado (sin revelar)
        this.auditService.logAllow('AUTH_FORGOT_PASSWORD', 'user', phone, {
          severity: 'LOW',
          tags: [
            'authentication',
            'password-reset-requested',
            'user-not-found',
          ],
        });

        this.logger.warn(
          `Forgot password requested for non-existent user: ${phone}, requestId: ${requestId}`,
        );
      }

      // Siempre retornar el mismo mensaje (no revelar si existe)
      return ApiResponse.ok<ForgotPasswordResponseDto>(
        HttpStatus.OK,
        {
          message: 'Código de recuperación enviado al SMS',
          requestId,
        },
        'Solicitud procesada',
        { requestId },
      );
    } catch (error) {
      this.auditService.logError(
        'AUTH_FORGOT_PASSWORD',
        'user',
        phone,
        error instanceof Error ? error : new Error(String(error)),
        {
          severity: 'CRITICAL',
          tags: ['authentication', 'forgot-password-error'],
        },
      );

      this.logger.error(`Forgot password failed for ${phone}:`, error);
      return ApiResponse.fail<ForgotPasswordResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error en la solicitud',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * Resetear contraseña
   * @param resetPasswordDto
   */
  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<ApiResponse<ResetPasswordResponseDto>> {
    const { phone, resetCode, newPassword } = resetPasswordDto;
    const requestId = this.asyncContext.getRequestId();

    try {
      // Validar reset code
      const validationResult = await this.confirmationCodeService.validate(
        phone,
        resetCode,
        'reset',
      );

      if (!validationResult.isValid) {
        // Si se agotaron los intentos
        if (validationResult.attemptsRemaining === 0) {
          this.auditService.logDeny(
            'AUTH_RESET_PASSWORD',
            'user',
            phone,
            'Max reset attempts exceeded',
            {
              severity: 'MEDIUM',
              tags: [
                'authentication',
                'password-reset-failed',
                'max-attempts-exceeded',
              ],
            },
          );

          return ApiResponse.fail<ResetPasswordResponseDto>(
            HttpStatus.BAD_REQUEST,
            'Demasiados intentos fallidos. Solicite un nuevo código',
            'Max attempts exceeded',
            { requestId },
          );
        }

        // Código inválido
        this.auditService.logDeny(
          'AUTH_RESET_PASSWORD',
          'user',
          phone,
          'Invalid reset code',
          {
            severity: 'LOW',
            tags: ['authentication', 'password-reset-failed', 'invalid-code'],
          },
        );

        return ApiResponse.fail<ResetPasswordResponseDto>(
          HttpStatus.BAD_REQUEST,
          validationResult.error || 'Código inválido',
          'Invalid reset code',
          { requestId },
        );
      }

      // Buscar usuario
      const user = await this.usersService.findByPhone(phone);
      if (!user) {
        return ApiResponse.fail<ResetPasswordResponseDto>(
          HttpStatus.BAD_REQUEST,
          'Usuario no encontrado',
          'User not found',
          { requestId },
        );
      }

      // Hash de la nueva contraseña
      const passwordHash = await this.usersService.hashPassword(newPassword);

      // Actualizar contraseña
      await this.usersService.updatePasswordByPhone(phone, passwordHash);

      // Limpiar reset code
      await this.confirmationCodeService.clear(phone, 'reset');

      // Registrar reset exitoso
      this.auditService.logAllow('AUTH_RESET_PASSWORD', 'user', phone, {
        severity: 'HIGH',
        tags: ['authentication', 'password-reset', 'successful-reset'],
        changes: {
          after: {
            phone,
            passwordUpdated: true,
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.logger.log(
        `Password reset successfully for user: ${phone}, requestId: ${requestId}`,
      );

      return ApiResponse.ok<ResetPasswordResponseDto>(
        HttpStatus.OK,
        {
          message: 'Contraseña actualizada exitosamente',
          requestId,
        },
        'Reset exitoso',
        { requestId },
      );
    } catch (error) {
      this.auditService.logError(
        'AUTH_RESET_PASSWORD',
        'user',
        phone,
        error instanceof Error ? error : new Error(String(error)),
        {
          severity: 'CRITICAL',
          tags: ['authentication', 'password-reset-error'],
        },
      );

      this.logger.error(`Password reset failed for ${phone}:`, error);
      return ApiResponse.fail<ResetPasswordResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error en el reset',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * ⭐ NUEVO: Login de servicio con credenciales OAuth2
   * Busca el tenant por clientId, valida clientSecret, y genera JWT con actorType='service'
   * @param serviceLoginDto Contiene clientId y clientSecret
   */
  async serviceLogin(
    serviceLoginDto: ServiceLoginDto,
  ): Promise<ApiResponse<LoginResponseDto>> {
    const { clientId, clientSecret } = serviceLoginDto;
    const requestId = this.asyncContext.getRequestId();

    try {
      this.logger.log(
        `[${requestId}] Attempting service login with clientId: ${clientId}`,
      );

      // Buscar tenant por clientId
      const tenant = await this.tenantsRepository.findAll(
        { 'oauth2ClientCredentials.clientId': clientId },
        { skip: 0, limit: 1 },
      );

      if (!tenant.data || tenant.data.length === 0) {
        this.logger.warn(
          `[${requestId}] Service login failed: clientId not found`,
        );

        // Registrar intento fallido
        this.auditService.logDeny(
          'SERVICE_LOGIN',
          'service',
          clientId,
          'Invalid credentials - client not found',
          {
            severity: 'HIGH',
            tags: ['authentication', 'service-login', 'failed', 'invalid-credentials'],
          },
        );

        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.UNAUTHORIZED,
          'Credenciales inválidas',
          'clientId o clientSecret incorrectos',
          { requestId },
        );
      }

      const foundTenant = tenant.data[0];

      // Validar clientSecret
      if (
        !foundTenant.oauth2ClientCredentials ||
        foundTenant.oauth2ClientCredentials.clientSecret !== clientSecret
      ) {
        this.logger.warn(
          `[${requestId}] Service login failed: invalid clientSecret for tenant ${foundTenant.id}`,
        );

        // Registrar intento fallido
        this.auditService.logDeny(
          'SERVICE_LOGIN',
          'service',
          clientId,
          'Invalid credentials - secret mismatch',
          {
            severity: 'HIGH',
            tags: ['authentication', 'service-login', 'failed', 'invalid-credentials'],
          },
        );

        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.UNAUTHORIZED,
          'Credenciales inválidas',
          'clientId o clientSecret incorrectos',
          { requestId },
        );
      }

      // Generar JWT para servicio
      const jwtPayload = {
        sub: `svc:${foundTenant.id}`,
        iss: this.jwtIssuer,
        aud: this.jwtAudience,
        actorType: 'service',
        tenantId: foundTenant.id,
        scope: 'read write',
        expiresIn: 3600,
      };

      const accessResult = await this.jwtTokenPort.sign(jwtPayload);
      if (!accessResult.isSuccess) {
        this.logger.error(
          `[${requestId}] Error signing JWT for service login: ${accessResult.getError().message}`,
        );

        // Registrar error
        this.auditService.logError(
          'SERVICE_LOGIN',
          'service',
          clientId,
          new Error('JWT signing failed'),
          {
            severity: 'HIGH',
            tags: ['authentication', 'service-login', 'error', `tenantId:${foundTenant.id}`],
          },
        );

        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Error al generar token',
          'Internal server error',
          { requestId },
        );
      }

      const accessToken = accessResult.getValue();

      // Registrar login exitoso
      this.auditService.logAllow('SERVICE_LOGIN', 'service', clientId, {
        severity: 'HIGH',
        tags: ['authentication', 'service-login', 'successful', `tenantId:${foundTenant.id}`],
        changes: {
          after: {
            clientId,
            tenantId: foundTenant.id,
            timestamp: new Date().toISOString(),
            tokenType: 'Bearer',
          },
        },
      });

      this.logger.log(
        `[${requestId}] Service login successful for tenant ${foundTenant.id}`,
      );

      return ApiResponse.ok<LoginResponseDto>(
        HttpStatus.OK,
        {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
        },
        'Login exitoso',
        { requestId },
      );
    } catch (error) {
      this.logger.error(
        `[${requestId}] Error during service login: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );

      // Registrar error
      this.auditService.logError(
        'SERVICE_LOGIN',
        'service',
        clientId,
        error instanceof Error ? error : new Error(String(error)),
        {
          severity: 'HIGH',
          tags: ['authentication', 'service-login', 'error'],
        },
      );

      return ApiResponse.fail<LoginResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error en el login',
        'Internal server error',
        { requestId },
      );
    }
  }

  /**
   * Validación de credenciales contra la base de datos
   */
  private async validateCredentials(
    username: string,
    password: string,
  ): Promise<{
    valid: boolean;
    user?: UserDTO;
    reason?: 'PHONE_NOT_CONFIRMED';
  }> {
    try {
      // Buscar usuario por email
      const result = await this.usersService.findByPhone(username);

      if (!result.ok) {
        this.logger.warn(`Error finding user: ${username}`);
        return { valid: false };
      }

      const user = result.data;

      if (!user) {
        return { valid: false };
      }

      // Si el usuario no tiene contraseña, aceptar
      const userRaw = await this.usersService.findByIdRaw(user.id);
      if (!userRaw || !userRaw.passwordHash) {
        // Verificar que el teléfono esté confirmado
        if (!userRaw?.phoneConfirmed) {
          return { valid: false, reason: 'PHONE_NOT_CONFIRMED' };
        }
        return { valid: true, user };
      }

      // Verificar contraseña
      const isPasswordValid = await this.usersService.verifyPassword(
        password,
        userRaw.passwordHash,
      );

      if (!isPasswordValid) {
        return { valid: false };
      }

      // Verificar que el teléfono esté confirmado
      if (!userRaw.phoneConfirmed) {
        return { valid: false, reason: 'PHONE_NOT_CONFIRMED' };
      }

      return { valid: true, user };
    } catch (error) {
      this.logger.error('Error validating credentials:', error);
      return { valid: false };
    }
  }
}
