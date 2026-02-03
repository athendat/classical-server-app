import type { Response } from 'express';

import {
  Controller,
  Post,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiHeader,
  ApiSecurity,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { UsersService } from 'src/modules/users/application/users.service';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { UpdateMyPasswordDto, UpdateUserDto } from 'src/modules/users/dto';

/**
 * ProfileController: Endpoints para que un usuario gestione su propio perfil
 *
 * Implementa:
 * - Actualización de perfil personal (/users/me)
 * - Cambio de contraseña personal (/users/me/password)
 * - Solo requiere autenticación JWT (sin validación de permisos)
 * - Auditoría end-to-end en servicio
 */
@ApiTags('Profile')
@ApiBearerAuth('Bearer Token')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly usersService: UsersService,
    private readonly asyncContextService: AsyncContextService,
  ) {}

  /**
   * Actualizar datos del perfil del usuario autenticado
   * PATCH /users/me
   *
   * Permite que el usuario actualice sus propios datos (email, fullname, phone)
   * Solo requiere autenticación JWT (sin validación de permisos)
   * El userId se extrae automáticamente del JWT
   */
  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar mi perfil',
    description:
      'Actualiza los datos del perfil del usuario autenticado (email, fullname, phone). Todos los campos son opcionales.',
  })
  @ApiBody({
    type: UpdateUserDto,
    examples: {
      example1: {
        summary: 'Actualizar nombre y email',
        value: {
          email: 'john.updated@example.com',
          fullname: 'John Doe Updated',
        },
      },
      example2: {
        summary: 'Actualizar solo teléfono',
        value: {
          phone: '51999888777',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Perfil actualizado exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Datos de usuario actualizados exitosamente',
        data: {
          userId: '550e8400-e29b-41d4-a716-446655440000',
          email: 'john.updated@example.com',
          fullname: 'John Doe Updated',
          roleKeys: ['user'],
          status: 'active',
          createdAt: '2025-01-05T10:00:00Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async updateProfile(
    @Res() res: Response,
    @Body() dto: UpdateUserDto,
  ): Promise<Response> {
    const userId = this.asyncContextService.getActorId()!;
    const response = await this.usersService.updateMyProfile(userId, dto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Cambiar contraseña del usuario autenticado
   * POST /users/me/password
   *
   * Permite que el usuario cambie su propia contraseña
   * Solo requiere autenticación JWT (sin validación de permisos)
   * El userId se extrae automáticamente del JWT
   */
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar mi contraseña',
    description: 'Actualiza la contraseña del usuario autenticado',
  })
  @ApiBody({
    type: UpdateMyPasswordDto,
    examples: {
      example1: {
        summary: 'Nueva contraseña',
        value: {
          password: 'NewSecurePassword123!',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Contraseña actualizada exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Contraseña actualizada exitosamente',
        data: {
          userId: 'user-001',
          email: 'john@example.com',
          fullname: 'John Doe',
          roleKeys: ['user'],
          status: 'active',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Contraseña inválida',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async changePassword(
    @Res() res: Response,
    @Body() dto: UpdateMyPasswordDto,
  ): Promise<Response> {
    const userId = this.asyncContextService.getActorId()!;
    const response = await this.usersService.updateMyPassword(userId, dto);
    return res.status(response.statusCode).json(response);
  }
}
