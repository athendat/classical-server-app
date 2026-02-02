import type { Response } from 'express';

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNoContentResponse,
  ApiHeader,
  ApiSecurity,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
// import { PermissionsGuard } from 'src/modules/permissions/infrastructure/guards/permissions.guard';
// import { Permissions } from 'src/modules/auth/decorators/permissions.decorator';
import { UsersService } from 'src/modules/users/application/users.service';
import { AsyncContextService } from 'src/common/context/async-context.service';
import {
  CreateUserDto,
  UpdateUserRolesDto,
  UpdatePasswordDto,
  UpdateUserDto,
} from 'src/modules/users/dto';

/**
 * UsersController: Endpoints HTTP para gestión de usuarios
 *
 * Implementa:
 * - CRUD de usuarios con patrón ApiResponse
 * - Seguridad con JWT y permisos de autorización
 * - Documentación Swagger completa
 * - Auditoría end-to-end en servicio
 */
@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiSecurity('access-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly asyncContextService: AsyncContextService,
  ) {}

  /**
   * Crear nuevo usuario
   * POST /users
   *
   * El userId se extrae automáticamente del JWT
   * El usuario se crea con UN SOLO rol (no array)
   * La contraseña se proporciona en texto plano
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nuevo usuario',
    description:
      'Crea un nuevo usuario con un único rol. El userId se genera automáticamente y el creador se extrae del JWT.',
  })
  @ApiCreatedResponse({
    description: 'Usuario creado exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 201,
        message: 'Usuario creado exitosamente',
        data: {
          userId: '550e8400-e29b-41d4-a716-446655440000',
          email: 'john@example.com',
          fullname: 'John Doe',
          roleKey: 'user',
          status: 'active',
          createdAt: '2025-01-15T10:00:00Z',
        },
        meta: { requestId: 'uuid-xxx' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o error en validación',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async create(
    @Res() res: Response,
    @Body() dto: CreateUserDto,
  ): Promise<Response> {
    const response = await this.usersService.create(dto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtener usuario por ID
   * GET /users/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener usuario por ID',
    description: 'Devuelve los detalles de un usuario específico',
  })
  @ApiOkResponse({
    description: 'Usuario encontrado',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        data: {
          userId: 'user-001',
          email: 'john@example.com',
          fullname: 'John Doe',
          roleKeys: ['user'],
          status: 'active',
          createdAt: '2025-01-05T10:00:00Z',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Usuario no encontrado',
    schema: {
      example: {
        ok: false,
        statusCode: 200,
        data: null,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async getUser(
    @Res() res: Response,
    @Param('id') id: string,
  ): Promise<Response> {
    const response = await this.usersService.findById(id);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Listar todos los usuarios
   * GET /users
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Listar todos los usuarios',
    description: 'Devuelve una lista de todos los usuarios activos del sistema',
  })
  @ApiOkResponse({
    description: 'Lista de usuarios obtenida exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        data: [
          {
            userId: 'user-001',
            email: 'john@example.com',
            fullname: 'John Doe',
            roleKeys: ['user'],
            status: 'active',
          },
        ],
        meta: { requestId: 'uuid-xxx', count: 1 },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async listUsers(@Res() res: Response): Promise<Response> {
    const response = await this.usersService.list();
    return res.status(response.statusCode).json(response);
  }

  /**
   * Actualizar rol de usuario
   * POST /users/:id/roles
   */
  @Post(':id/roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar rol de usuario',
    description: 'Asigna un nuevo rol (único) a un usuario específico',
  })
  @ApiBody({
    type: UpdateUserRolesDto,
    examples: {
      example1: {
        summary: 'Asignar rol admin',
        value: {
          roleKey: 'admin',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Rol actualizado exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Rol actualizado exitosamente',
        data: {
          userId: '550e8400-e29b-41d4-a716-446655440000',
          email: 'john@example.com',
          fullname: 'John Doe',
          roleKey: 'admin',
          status: 'active',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos',
  })
  @ApiNotFoundResponse({
    description: 'Usuario no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async updateRoles(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesDto,
  ): Promise<Response> {
    const response = await this.usersService.updateRoles(id, dto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Cambiar contraseña de usuario
   * POST /users/:id/password
   */
  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar contraseña de usuario',
    description: 'Actualiza la contraseña de un usuario específico',
  })
  @ApiBody({
    type: UpdatePasswordDto,
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
  @ApiNotFoundResponse({
    description: 'Usuario no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async updatePassword(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() dto: UpdatePasswordDto,
  ): Promise<Response> {
    const response = await this.usersService.updatePassword(id, dto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Actualizar datos del usuario
   * PATCH /users/:id
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar datos del usuario',
    description:
      'Actualiza los datos del usuario (email, fullname, phone). Todos los campos son opcionales.',
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
    description: 'Datos de usuario actualizados exitosamente',
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
  @ApiNotFoundResponse({
    description: 'Usuario no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async updateUser(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<Response> {
    const response = await this.usersService.update(id, dto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Deshabilitar usuario (soft delete)
   * DELETE /users/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deshabilitar usuario',
    description: 'Deshabilita un usuario específico (soft delete)',
  })
  @ApiNoContentResponse({
    description: 'Usuario deshabilitado exitosamente',
  })
  @ApiNotFoundResponse({
    description: 'Usuario no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  async deleteUser(
    @Res() res: Response,
    @Param('id') id: string,
  ): Promise<Response> {
    const response = await this.usersService.disable(id);
    return res.status(response.statusCode).json(response);
  }
}
