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

import type { IJwtTokenPort } from '../domain/ports/jwt-token.port';
import type { UserDTO } from '../../users/domain/ports/users.port';

import { LoginDto, LoginResponseDto } from '../dto/login.dto';

import { ApiResponse } from 'src/common/types/api-response.type';

interface ValidationResponse {
  valid: boolean;
  user?: UserDTO;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtAudience: string;
  private readonly jwtIssuer: string;

  constructor(
    @Inject('IJwtTokenPort')
    private readonly jwtTokenPort: IJwtTokenPort,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly asyncContext: AsyncContextService,
  ) {
    this.jwtAudience =
      configService.get<string>('JWT_AUDIENCE') || 'classical-service';
    this.jwtIssuer = configService.get<string>('JWT_ISSUER') || 'classical-api';
  }

  async login(loginDto: LoginDto): Promise<ApiResponse<LoginResponseDto>> {
    const { username, password } = loginDto;
    const requestId = this.asyncContext.getRequestId();

    try {
      const validation: ValidationResponse = await this.validateCredentials(
        username,
        password,
      );
      if (!validation.valid) {
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
          'Invalid credentials',
          'Failed login attempt',
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

  async refreshToken(
    refreshToken: string,
  ): Promise<ApiResponse<LoginResponseDto>> {
    const requestId = this.asyncContext.getRequestId();

    try {
      // Validar el refresh token
      const verifyResult = await this.jwtTokenPort.verify(refreshToken);

      if (!verifyResult.isSuccess) {
        // Registrar intento fallido de refresh (no-bloqueante)
        this.auditService.logDeny(
          'AUTH_REFRESH_TOKEN',
          'token',
          'refresh_token',
          'Invalid or expired refresh token',
          {
            severity: 'MEDIUM',
            tags: ['authentication', 'token-refresh-failed', 'invalid-token'],
          },
        );

        this.logger.warn(
          `Failed token refresh attempt with invalid/expired token, requestId: ${requestId}`,
        );
        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.BAD_REQUEST,
          'Invalid or expired refresh token',
          'Token refresh failed',
          { requestId },
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload = verifyResult.getValue();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (payload.type !== 'refresh') {
        this.auditService.logDeny(
          'AUTH_REFRESH_TOKEN',
          'token',
          'refresh_token',
          'Invalid token type - expected refresh token',
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
          `Token refresh attempted with invalid token type, requestId: ${requestId}`,
        );
        return ApiResponse.fail<LoginResponseDto>(
          HttpStatus.BAD_REQUEST,
          'Invalid token type',
          'Token refresh failed',
          { requestId },
        );
      }

      // Generar nuevo access token
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const sub = payload.sub;
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
   * Validación de credenciales contra la base de datos
   */
  private async validateCredentials(
    username: string,
    password: string,
  ): Promise<{ valid: boolean; user?: UserDTO }> {
    try {
      // Buscar usuario por email
      const result = await this.usersService.findByEmail(username);

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
        return { valid: true, user };
      }

      // Verificar contraseña
      const isPasswordValid = await this.usersService.verifyPassword(
        password,
        userRaw.passwordHash as string,
      );

      if (!isPasswordValid) {
        return { valid: false };
      }

      return { valid: true, user };
    } catch (error) {
      this.logger.error('Error validating credentials:', error);
      return { valid: false };
    }
  }
}
