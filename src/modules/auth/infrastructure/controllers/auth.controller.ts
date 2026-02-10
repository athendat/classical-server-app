import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiTooManyRequestsResponse,
  ApiHeader,
  ApiSecurity,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from '../../application/auth.service';
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
} from '../../dto';

// ⭐ NUEVO: Import MerchantRegistrationDto
import { MerchantRegistrationDto } from '../../dto/merchant-registration.dto';
import { ServiceLoginDto } from '../../dto/service-login.dto';

import { ApiKeyGuard } from '../../guards/api-key.guard';

@ApiTags('Auth')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description: 'Autentica un usuario y retorna un token JWT de acceso',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Login exitoso',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Credenciales inválidas',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error en la generación de tokens',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.authService.login(loginDto);
    return res.status(response.statusCode).json(response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar token de acceso',
    description: 'Genera un nuevo token de acceso usando el refresh token',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refresh_token: {
          type: 'string',
          description: 'Token de refresco',
        },
      },
      required: ['refresh_token'],
    },
  })
  @ApiOkResponse({
    description: 'Token renovado exitosamente',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Token de refresco inválido o expirado',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error en la generación del nuevo token',
  })
  async refreshToken(
    @Body('refresh_token') refreshToken: string,
    @Res() res: Response,
  ): Promise<Response> {
    if (!refreshToken) {
      throw new BadRequestException('refresh_token is required');
    }
    const response = await this.authService.refreshToken(refreshToken);
    return res.status(response.statusCode).json(response);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar nuevo usuario',
    description:
      'Crea un nuevo usuario con teléfono y contraseña, genera código de confirmación',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'Usuario registrado, código enviado',
    type: RegisterResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o teléfono ya registrado',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error en el registro',
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.authService.register(registerDto);
    return res.status(response.statusCode).json(response);
  }

  // ⭐ NUEVO: Endpoint de auto-registro de comerciante
  @Post('register-merchant')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar nuevo comerciante',
    description:
      'Crea un nuevo usuario con roles user+merchant, requiere phone y email obligatorios',
  })
  @ApiBody({ type: MerchantRegistrationDto })
  @ApiCreatedResponse({
    description: 'Comerciante registrado, código SMS enviado',
    type: RegisterResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o validación fallida',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error en el registro de comerciante',
  })
  async registerMerchant(
    @Body() merchantRegistrationDto: MerchantRegistrationDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.authService.registerMerchant(
      merchantRegistrationDto,
    );
    return res.status(response.statusCode).json(response);
  }

  @Post('confirm-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar teléfono',
    description:
      'Valida el código de confirmación y marca el teléfono como confirmado',
  })
  @ApiBody({ type: ConfirmPhoneDto })
  @ApiOkResponse({
    description: 'Teléfono confirmado exitosamente',
    type: ConfirmPhoneResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Código inválido, expirado o intentos agotados',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error en la confirmación',
  })
  async confirmPhone(
    @Body() confirmPhoneDto: ConfirmPhoneDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.authService.confirmPhone(confirmPhoneDto);
    return res.status(response.statusCode).json(response);
  }

  @Post('resend-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reenviar código de confirmación',
    description:
      'Genera un nuevo código de confirmación (máximo 3 reenvíos en 24 horas)',
  })
  @ApiBody({ type: ResendCodeDto })
  @ApiOkResponse({
    description: 'Nuevo código enviado',
    type: ResendCodeResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Usuario no encontrado o ya confirmado',
  })
  @ApiTooManyRequestsResponse({
    description: 'Límite de reenvíos alcanzado (3 en 24 horas)',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error al reenviar código',
  })
  async resendCode(
    @Body() resendCodeDto: ResendCodeDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.authService.resendCode(resendCodeDto);
    return res.status(response.statusCode).json(response);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar recuperación de contraseña',
    description: 'Genera un código de recuperación y lo envía por SMS',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({
    description: 'Código de recuperación enviado',
    type: ForgotPasswordResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error en la solicitud',
  })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.authService.forgotPassword(forgotPasswordDto);
    return res.status(response.statusCode).json(response);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer contraseña',
    description: 'Valida el código de recuperación y actualiza la contraseña',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    description: 'Contraseña actualizada exitosamente',
    type: ResetPasswordResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Código inválido, expirado o intentos agotados',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error en el reset',
  })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.authService.resetPassword(resetPasswordDto);
    return res.status(response.statusCode).json(response);
  }

  // Endpoint para login de servicio
  @Post('service-login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: 'Login de servicio con OAuth2 credentials',
    description:
      'Autentica un servicio usando clientId y clientSecret, retorna un token JWT con actorType=service',
  })
  @ApiOkResponse({
    description: 'Login exitoso, token generado',
    type: LoginResponseDto,
  })
  @ApiBody({ type: ServiceLoginDto })
  @ApiForbiddenResponse({
    description: 'clientId o clientSecret inválidos',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error en la generación del token',
  })
  async serviceLogin(
    @Body() serviceLoginDto: ServiceLoginDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.authService.serviceLogin(serviceLoginDto);
    return res.status(response.statusCode).json(response);
  }
}
