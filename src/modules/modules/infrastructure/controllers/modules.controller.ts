import type { Response, Request } from 'express';

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
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
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { ModulesService } from '../../application/modules.service';
import { NavigationService } from '../../application/navigation.service';
import { CreateModuleDto, UpdateModuleDto, ReorderModulesDto } from '../../dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
// import { Permissions } from 'src/modules/auth/decorators/permissions.decorator';
// import { PermissionsGuard } from 'src/modules/permissions/infrastructure/guards/permissions.guard';

/**
 * ModulesController - Endpoints REST para gestión de módulos
 * Ruta base: /modules
 *
 * Seguridad:
 * - Todos los endpoints requieren Bearer token JWT
//  * - Validación de permisos con @Permissions()
 */
@ApiTags('Modules')
@ApiBearerAuth('access-token')
@ApiSecurity('access-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@UseGuards(JwtAuthGuard)
@Controller('modules')
export class ModulesController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly navigationService: NavigationService,
  ) {}

  /**
   * GET /modules
   * Listar todos los módulos activos (con caché 60s)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all modules',
    description: 'Retrieves a list of all active modules with 60s cache',
  })
  @ApiOkResponse({
    description: 'List of modules',
    type: [Object],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.read')
  async findAll(@Res() res: Response): Promise<Response> {
    const response = await this.modulesService.findAll();
    return res.status(response.statusCode).json(response);
  }

  /**
   * GET /modules/navigation
   * Construir navegación dinámica basada en módulos y permisos del usuario
   */
  @Get('navigation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get dynamic navigation',
    description:
      'Builds dynamic navigation structure based on modules and user permissions.',
  })
  @ApiOkResponse({
    description: 'Dynamic navigation with metadata',
    type: Object,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.read')
  async getNavigation(@Res() res: Response): Promise<Response> {
    const response = await this.navigationService.buildNavigation();
    return res.status(response.statusCode).json(response);
  }

  /**
   * PATCH /modules/reorder
   * Reordenar módulos dentro de una categoría o a nivel superior
   * Valida que los órdenes sean consecutivos (0, 1, 2, ...)
   */
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reorder modules',
    description:
      'Reorders modules within a parent or at top-level. Orders must be consecutive starting from 0.',
  })
  @ApiOkResponse({
    description: 'Modules reordered successfully',
    type: [Object],
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or invalid order sequence',
  })
  @ApiNotFoundResponse({
    description: 'One or more modules not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.update')
  async reorderModules(
    @Res() res: Response,
    @Body() reorderDto: ReorderModulesDto,
  ): Promise<Response> {
    const response = await this.modulesService.reorderModules(reorderDto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * GET /modules/system
   * Listar solo módulos del sistema (admin)
   */
  @Get('system')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get system modules',
    description: 'Retrieves only system modules (isSystem: true)',
  })
  @ApiOkResponse({
    description: 'List of system modules',
    type: [Object],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.read')
  async findSystemModules(@Res() res: Response): Promise<Response> {
    const response = await this.modulesService.findSystemModules();
    return res.status(response.statusCode).json(response);
  }

  /**
   * GET /modules/:id
   * Obtener un módulo específico con sus permisos embebidos
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get module by id',
    description: 'Retrieves a specific module with embedded permissions',
  })
  @ApiParam({
    name: 'id',
    description: 'Module id',
  })
  @ApiOkResponse({
    description: 'Module found',
    type: Object,
  })
  @ApiNotFoundResponse({
    description: 'Module not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.read')
  async findById(
    @Res() res: Response,
    @Param('id') id: string,
  ): Promise<Response> {
    const response = await this.modulesService.findById(id);
    return res.status(response.statusCode).json(response);
  }

  /**
   * POST /modules
   * Crear un nuevo módulo
   * Genera automáticamente el array de permissions[] a partir de actions[]
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create module',
    description:
      'Creates a new module and auto-generates permissions from actions',
  })
  @ApiCreatedResponse({
    description: 'Module created successfully',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.create')
  async create(
    @Res() res: Response,
    @Body() createModuleDto: CreateModuleDto,
  ): Promise<Response> {
    const response = await this.modulesService.create(createModuleDto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * PUT /modules/:id
   * Actualizar un módulo existente
   * Si se actualizan las acciones, se regeneran los permisos manteniendo enabled y requiresSuperAdmin
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update module',
    description:
      'Updates an existing module. If actions are changed, permissions are regenerated preserving enabled and requiresSuperAdmin flags',
  })
  @ApiParam({
    name: 'id',
    description: 'Module id',
  })
  @ApiOkResponse({
    description: 'Module updated successfully',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input',
  })
  @ApiNotFoundResponse({
    description: 'Module not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.update')
  async update(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateModuleDto: UpdateModuleDto,
  ): Promise<Response> {
    const response = await this.modulesService.update(id, updateModuleDto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * PATCH /modules/:id/disable
   * Deshabilitar un módulo (soft-delete)
   * Solo se pueden deshabilitar módulos no del sistema
   */
  @Patch(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable module',
    description:
      'Disables a module (soft-delete). Only non-system modules can be disabled',
  })
  @ApiParam({
    name: 'id',
    description: 'Module id',
  })
  @ApiOkResponse({
    description: 'Module disabled successfully',
    type: Object,
  })
  @ApiBadRequestResponse({
    description: 'Cannot disable system module',
  })
  @ApiNotFoundResponse({
    description: 'Module not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.disable')
  async disable(
    @Res() res: Response,
    @Param('id') id: string,
  ): Promise<Response> {
    const response = await this.modulesService.disable(id);
    return res.status(response.statusCode).json(response);
  }

  /**
   * DELETE /modules/:id
   * Eliminar un módulo (hard-delete)
   * Solo se pueden eliminar módulos deshabilitados y no del sistema
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete module',
    description:
      'Deletes a module (hard-delete). Only disabled, non-system modules can be deleted. Permanently removes the module from the database.',
  })
  @ApiParam({
    name: 'id',
    description: 'Module id',
  })
  @ApiOkResponse({
    description: 'Module deleted successfully',
  })
  @ApiBadRequestResponse({
    description: 'Cannot delete system module or module is not disabled',
  })
  @ApiNotFoundResponse({
    description: 'Module not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  // @Permissions('modules.delete')
  async delete(
    @Res() res: Response,
    @Param('id') id: string,
  ): Promise<Response> {
    const response = await this.modulesService.hardDelete(id);
    return res.status(response.statusCode).json(response);
  }
}
