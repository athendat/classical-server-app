import type { Response } from 'express';

import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res,
  UseGuards,
  Delete,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { RolesService } from '../../application/roles.service';
import { CreateRoleDto } from '../../dto/create-role.dto';
import { UpdateRoleDto } from '../../dto/update-role.dto';
import { UpdateRolePermissionsDto } from '../../dto/update-role-permissions.dto';
import { Role } from '../schemas/role.schema';
import { ApiResponse } from '../../../../common/types';
import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
// import { PermissionsGuard } from '../guards/permissions.guard';

/**
 * RolesController: Endpoints HTTP para gestión de roles
 *
 * Seguridad:
 * - Todos los endpoints requieren autorización mediante Permissions guard
 * - Validación de DTOs automática
 * - Documentación Swagger completa
 * - Auditoría end-to-end de todas las operaciones
 */
@ApiTags('Roles')
@ApiBearerAuth('Bearer Token')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * Crear nuevo rol
   * POST /roles
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('roles.create')
  @ApiOperation({
    summary: 'Create a new role',
    description:
      'Creates a new role with permissions. Only system roles are immutable.',
  })
  @ApiCreatedResponse({
    description: 'Role created successfully',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or role key already exists',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async create(
    @Body() createRoleDto: CreateRoleDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response: ApiResponse<Role> =
      await this.rolesService.create(createRoleDto);

    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtener todos los roles
   * GET /roles
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Permissions('roles.read')
  @ApiOperation({
    summary: 'Get all roles',
    description:
      'Retrieves a list of all active roles (cached, 60 second TTL). Results are paginated.',
  })
  @ApiOkResponse({
    description: 'List of roles',
    type: [Object],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async findAll(@Res() res: Response): Promise<Response> {
    const response: ApiResponse<Role[]> = await this.rolesService.findAll();

    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtener roles del sistema
   * GET /roles/system
   */
  @Get('system')
  @HttpCode(HttpStatus.OK)
  @Permissions('roles.read')
  @ApiOperation({
    summary: 'Get system roles',
    description:
      'Retrieves all immutable system roles. These cannot be modified or deleted.',
  })
  @ApiOkResponse({
    description: 'List of system roles',
    type: [Object],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async findSystemRoles(@Res() res: Response): Promise<Response> {
    const response: ApiResponse<Role[]> =
      await this.rolesService.findSystemRoles();

    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtener rol por clave única
   * GET /roles/by-key/:key
   */
  @Get('by-key/:key')
  @HttpCode(HttpStatus.OK)
  @Permissions('roles.read')
  @ApiOperation({
    summary: 'Get role by key',
    description:
      'Retrieves a specific role by its unique lowercase key identifier.',
  })
  @ApiParam({
    name: 'key',
    description: 'Unique role key (lowercase with dashes)',
    example: 'admin',
  })
  @ApiOkResponse({
    description: 'Role found',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Invalid key parameter',
  })
  @ApiNotFoundResponse({
    description: 'Role not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async findByKey(
    @Param('key') key: string,
    @Res() res: Response,
  ): Promise<Response> {
    if (!key || key.trim().length === 0) {
      throw new BadRequestException('Key parameter is required');
    }

    const response: ApiResponse<Role> = await this.rolesService.findByKey(key);

    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtener rol por ID
   * GET /roles/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Permissions('roles.read')
  @ApiOperation({
    summary: 'Get role by id',
    description: 'Retrieves a specific role by its UUID identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'Role ID (UUID v4 format)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Role found',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Invalid ID parameter',
  })
  @ApiNotFoundResponse({
    description: 'Role not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async findById(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response> {
    if (!id || id.trim().length === 0) {
      throw new BadRequestException('ID parameter is required');
    }

    const response: ApiResponse<Role> = await this.rolesService.findById(id);

    return res.status(response.statusCode).json(response);
  }

  /**
   * Actualizar rol
   * PUT /roles/:id
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @Permissions('roles.update')
  @ApiOperation({
    summary: 'Update role',
    description:
      'Updates an existing role with partial or full data. System roles cannot be updated.',
  })
  @ApiParam({
    name: 'id',
    description: 'Role ID (UUID v4 format)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Role updated successfully',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or system role',
  })
  @ApiNotFoundResponse({
    description: 'Role not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @Res() res: Response,
  ): Promise<Response> {
    if (!id || id.trim().length === 0) {
      throw new BadRequestException('ID parameter is required');
    }

    const response: ApiResponse<Role> = await this.rolesService.update(
      id,
      updateRoleDto,
    );

    return res.status(response.statusCode).json(response);
  }

  /**
   * Deshabilitar rol (soft-delete)
   * PATCH /roles/:id/disable
   */
  @Patch(':id/disable')
  @HttpCode(HttpStatus.OK)
  @Permissions('roles.disable')
  @ApiOperation({
    summary: 'Disable role',
    description:
      'Soft-deletes a role by changing its status to disabled. Can be re-enabled. System roles cannot be disabled.',
  })
  @ApiParam({
    name: 'id',
    description: 'Role ID (UUID v4 format)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Role disabled successfully',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Invalid ID or system role',
  })
  @ApiNotFoundResponse({
    description: 'Role not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async disable(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response> {
    if (!id || id.trim().length === 0) {
      throw new BadRequestException('ID parameter is required');
    }

    const response: ApiResponse<Role> = await this.rolesService.disable(id);

    return res.status(response.statusCode).json(response);
  }

  /**
   * Eliminar rol permanentemente (hard-delete)
   * PATCH /roles/:id/hard-delete
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('roles.hardDelete')
  @ApiOperation({
    summary: 'Permanently delete role',
    description:
      'Permanently removes a role from the system. Only disabled, non-system roles can be deleted.',
  })
  @ApiParam({
    name: 'id',
    description: 'Role ID (UUID v4 format)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiNoContentResponse({
    description: 'Role deleted successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid ID, system role, or role still enabled',
  })
  @ApiNotFoundResponse({
    description: 'Role not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async hardDelete(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response> {
    if (!id || id.trim().length === 0) {
      throw new BadRequestException('ID parameter is required');
    }

    const response: ApiResponse<string> =
      await this.rolesService.hardDelete(id);

    return res.status(response.statusCode).json(response);
  }

  /**
   * Actualizar solo los permisos de un rol
   * PATCH /roles/:id/permissions
   */
  @Patch(':id/permissions')
  @HttpCode(HttpStatus.OK)
  @Permissions('roles.update')
  @ApiOperation({
    summary: 'Update role permissions',
    description:
      'Updates only the permissions of a role. System roles cannot have their permissions modified.',
  })
  @ApiParam({
    name: 'id',
    description: 'Role ID (UUID v4 format)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Role permissions updated successfully',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or system role',
  })
  @ApiNotFoundResponse({
    description: 'Role not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async updatePermissions(
    @Param('id') id: string,
    @Body() updatePermissionsDto: UpdateRolePermissionsDto,
    @Res() res: Response,
  ): Promise<Response> {
    if (!id || id.trim().length === 0) {
      throw new BadRequestException('ID parameter is required');
    }

    const response: ApiResponse<Role> =
      await this.rolesService.updatePermissions(id, updatePermissionsDto);

    return res.status(response.statusCode).json(response);
  }
}
