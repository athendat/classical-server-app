import type { Response } from 'express';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/modules/authz/guards/permissions.guard';
import { Permissions } from 'src/modules/auth/decorators/permissions.decorator';
import { CurrentActor } from 'src/modules/auth/decorators/current-actor.decorator';
import type { Actor } from 'src/common/interfaces';
import { TenantsService } from 'src/modules/tenants/application/tenant.service';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TransitionTenantStateDto,
  TenantResponseDto,
  TenantPaginatedResponseDto,
  TenantLifecyclePaginatedResponseDto,
} from 'src/modules/tenants/dto';
import type { QueryParams, SortOrder } from 'src/common/types';

/**
 * Controlador para endpoints de Tenants (negocios)
 * Todos los endpoints requieren autenticación JWT
 */
@ApiTags('Tenants')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantsService) {}

  /**
   * Crear un nuevo tenant
   * Status inicial: PENDING_REVIEW
   * PAN se valida con Luhn y se almacena en Vault
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('tenants.create')
  @ApiOperation({
    summary: 'Crear nuevo tenant',
    description:
      'Crea un nuevo negocio (tenant) con estado inicial PENDING_REVIEW. El PAN se valida con el algoritmo Luhn y se almacena en Vault.',
  })
  @ApiCreatedResponse({
    description: 'Tenant creado exitosamente',
    type: TenantResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o PAN no cumple validación Luhn',
  })
  @ApiConflictResponse({
    description: 'El email ya está registrado como tenant',
  })
  @ApiUnauthorizedResponse({
    description: 'No autenticado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para crear tenants',
  })
  async create(
    @Body() dto: CreateTenantDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.tenantService.createTenant(dto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Listar tenants con paginación y filtros
   * PAN siempre se devuelve enmascarado
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Permissions('tenants.read')
  @ApiOperation({
    summary: 'Listar tenants',
    description:
      'Obtiene una lista paginada de todos los tenants con filtros opcionales. PAN se devuelve siempre enmascarado (****-****-****-XXXX).',
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
  @ApiOkResponse({
    description: 'Tenants recuperados',
    type: TenantPaginatedResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'No autenticado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para leer tenants',
  })
  async list(
    @Res() res: Response,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: SortOrder,
  ): Promise<Response> {
    // Construimos parámetros de consulta
    const queryParams: QueryParams = {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
      sortBy: sortBy,
      sortOrder: sortOrder,
      search: search?.trim(),
    };

    const response = await this.tenantService.listTenants(queryParams);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtener un tenant por ID
   * Si el usuario tiene el permiso 'tenants.view-sensitive', se devuelve PAN desenmascarado
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Permissions('tenants.read')
  @ApiOperation({
    summary: 'Obtener tenant por ID',
    description:
      'Obtiene los detalles de un tenant específico. El PAN se devuelve enmascarado a menos que el usuario tenga el permiso tenants.view-sensitive.',
  })
  @ApiOkResponse({
    description: 'Tenant encontrado',
    type: TenantResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Tenant no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autenticado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para leer tenants',
  })
  async getById(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.tenantService.getTenantById(id);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Actualizar información de un tenant
   * No permite cambiar el estado (usar endpoint /transition para eso)
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Permissions('tenants.write')
  @ApiOperation({
    summary: 'Actualizar tenant',
    description:
      'Actualiza la información de un tenant existente. No permite cambiar el estado (usar /tenants/:id/transition).',
  })
  @ApiOkResponse({
    description: 'Tenant actualizado',
    type: TenantResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos',
  })
  @ApiNotFoundResponse({
    description: 'Tenant no encontrado',
  })
  @ApiConflictResponse({
    description: 'El email ya está registrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autenticado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para actualizar tenants',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentActor() actor: Actor,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.tenantService.updateTenant(id, dto, actor);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Cambiar el estado de un tenant
   * Valida la transición con la máquina de estados
   * Registra la transición en tenant_lifecycles
   */
  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Permissions('tenants.approve')
  @ApiOperation({
    summary: 'Cambiar estado del tenant',
    description:
      'Cambia el estado de un tenant según la máquina de estados definida. Registra la transición en el historial de ciclo de vida.',
  })
  @ApiOkResponse({
    description: 'Estado actualizado',
    type: TenantResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Transición de estado inválida',
  })
  @ApiNotFoundResponse({
    description: 'Tenant no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autenticado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para cambiar estados',
  })
  async transition(
    @Param('id') id: string,
    @Body() dto: TransitionTenantStateDto,
    @CurrentActor() actor: Actor,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.tenantService.transitionTenantState(
      id,
      dto,
      actor,
    );
    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtener historial de cambios de estado de un tenant
   * Muestra todos los eventos del ciclo de vida con timestamps
   */
  @Get(':id/lifecycle')
  @HttpCode(HttpStatus.OK)
  @Permissions('tenants.read')
  @ApiOperation({
    summary: 'Obtener historial de ciclo de vida',
    description:
      'Obtiene el historial completo de cambios de estado (transiciones) de un tenant, paginado.',
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
    type: TenantLifecyclePaginatedResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Tenant no encontrado',
  })
  @ApiUnauthorizedResponse({
    description: 'No autenticado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para leer tenants',
  })
  async getLifecycle(
    @Res() res: Response,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<Response> {
    const pagination = {
      page: page || 1,
      limit: limit || 20,
    };

    const response = await this.tenantService.getTenantLifecycle(
      id,
      pagination,
    );
    return res.status(response.statusCode).json(response);
  }
}
