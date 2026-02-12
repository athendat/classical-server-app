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
  Query,
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
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiQuery,
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
import { UserStatus } from '../../domain/enums';
import type { QueryParams, SortOrder } from 'src/common/types';

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
@ApiBearerAuth('Bearer Token')
@ApiSecurity('x-api-key')
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
  ) { }

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
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 10, max: 100)',
    example: 10,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Search query to filter terminals by sn, brand, model, or description',
    example: 'Samsung',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Field to sort by',
    example: 'sn',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    type: String,
    description: 'Sort order: ascending or descending',
    example: 'asc',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    enum: UserStatus,
    description: 'Filter users by status',
    example: 'active',
  })
  @ApiQuery({
    name: 'roleKey',
    required: false,
    type: String,
    description: 'Filter users by role key',
    example: 'admin',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para leer tenants',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async listUsers(
    @Res() res: Response,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: SortOrder,
    @Query('status') status?: string,
    @Query('roleKey') roleKey?: string,
  ): Promise<Response> {
    // Construimos parámetros de consulta
    const queryParams: QueryParams = {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
      sortBy: sortBy,
      sortOrder: sortOrder,
      search: search?.trim(),
      filters: {
        ...(status ? { status: status?.trim() } : {}),
        ...(roleKey ? { roleKey: roleKey?.trim() } : {}),
      },
    };
    const response = await this.usersService.list(queryParams);
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
