import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from '../../application/auth.service';
import { LoginDto, LoginResponseDto } from '../../dto/login.dto';
import { ApiResponse } from 'src/common/types/api-response.type';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  @ApiInternalServerErrorResponse({
    description: 'Error en la generación de tokens',
  })
  async login(@Body() loginDto: LoginDto, @Res() res: Response): Promise<Response> {
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
}
