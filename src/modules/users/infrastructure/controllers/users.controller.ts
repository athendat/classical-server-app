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
import { Permissions } from 'src/modules/auth/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/modules/permissions/infrastructure/guards/permissions.guard';
import { UsersService } from 'src/modules/users/application/users.service';
import { AsyncContextService } from 'src/common/context/async-context.service';
import {
  CreateUserDto,
  UpdateUserRolesDto,
  UpdatePasswordDto,
  UpdateUserDto,
  TransitionUserStateDto,
} from 'src/modules/users/dto';
import { UserStatus } from '../../domain/enums/enums';
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
@UseGuards(JwtAuthGuard, PermissionsGuard)
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
  @Permissions('users.create')
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
   *
   * Admin-only: el acceso "perfil propio" vive en /profile para evitar
   * lecturas cross-tenant desde el controller administrativo.
   */
  @Get(':id')
  @Permissions('users.edit')
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
   *
   * Admin-only: merchants y usuarios base gestionan su propio contexto por
   * endpoints dedicados, no por este listado global del sistema.
   */
  @Get()
  @Permissions('users.edit')
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
  @Permissions('users.assign-roles')
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
   *
   * Sólo admins (users.edit). El cambio de contraseña por el propio
   * usuario debería ir contra /auth/change-password con validación
   * actorId === :id; eso queda como follow-up.
   */
  @Post(':id/password')
  @Permissions('users.edit')
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
   *
   * NOTA: este endpoint exige `users.edit` (admin-only en los seeds).
   * Para "perfil propio" debe usarse el endpoint /profile, que valida
   * que actorId === userId. Una validación de self/tenant aquí queda
   * pendiente como follow-up explícito (ver review de PR #32).
   */
  @Patch(':id')
  @Permissions('users.edit')
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
  @Permissions('users.delete')
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

  /**
   * Cambiar estado del usuario
   * POST /users/:id/transition
   *
   * Transiciones permitidas según máquina de estados:
   * - INACTIVE → ACTIVE (verificación de teléfono)
   * - ACTIVE → SUSPENDED (reporte de incidencia)
   * - SUSPENDED → ACTIVE (incidencia resuelta)
   * - {INACTIVE | ACTIVE | SUSPENDED} → DISABLED (cierre definitivo)
   */
  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.edit')
  @ApiOperation({
    summary: 'Cambiar estado del usuario',
    description:
      'Cambia el estado de un usuario según la máquina de estados definida. Registra la transición en el historial.',
  })
  @ApiBody({
    type: TransitionUserStateDto,
    examples: {
      example1: {
        summary: 'Verificar teléfono',
        value: {
          targetState: 'active',
          reason: 'Teléfono verificado correctamente',
        },
      },
      example2: {
        summary: 'Reportar incidencia',
        value: {
          targetState: 'suspended',
          reason: 'Actividad sospechosa detectada',
        },
      },
      example3: {
        summary: 'Cierre de cuenta',
        value: {
          targetState: 'disabled',
          reason: 'Solicitud de eliminación de cuenta del usuario',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Estado actualizado',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Usuario pasó de active a suspended',
        data: {
          id: 'user-001',
          email: 'john@example.com',
          fullname: 'John Doe',
          status: 'suspended',
          roleKey: 'user',
          createdAt: '2025-01-05T10:00:00Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Transición de estado inválida',
  })
  @ApiNotFoundResponse({
    description: 'Usuario no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para cambiar estados',
  })
  async transitionState(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() dto: TransitionUserStateDto,
  ): Promise<Response> {
    const actor = this.asyncContextService.getActor();
    const response = await this.usersService.transitionState(id, dto, actor);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtener historial de ciclo de vida del usuario
   * GET /users/:id/lifecycle
   *
   * Admin-only: el historial puede revelar cambios sensibles fuera del tenant.
   */
  @Get(':id/lifecycle')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.edit')
  @ApiOperation({
    summary: 'Obtener historial de ciclo de vida',
    description:
      'Obtiene el historial completo de cambios de estado (transiciones) de un usuario, paginado.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items por página (default: 20)',
  })
  @ApiOkResponse({
    description: 'Historial recuperado',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        data: {
          events: [
            {
              id: 'evt-001',
              userId: 'user-001',
              fromState: 'inactive',
              toState: 'active',
              triggeredBy: {
                userId: 'admin-001',
                username: 'admin_user',
                roleKey: 'admin',
              },
              reason: 'Teléfono verificado',
              timestamp: '2025-01-10T15:30:00Z',
            },
          ],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            pageSize: 20,
            totalCount: 1,
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Usuario no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para leer usuarios',
  })
  async getLifecycle(
    @Res() res: Response,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<Response> {
    const response = await this.usersService.getUserLifecycle(id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    return res.status(response.statusCode).json(response);
  }
}
