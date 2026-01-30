import type { Response } from 'express';

import {
  Controller,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/modules/authz/guards/permissions.guard';
import { Permissions } from 'src/modules/auth/decorators/permissions.decorator';
import type { QueryParams, SortOrder } from 'src/common/types/common.types';
import { AuditLogService, AuditFilterParams } from '../../application/audit-log.service';

/**
 * AuditController: Endpoints HTTP para consulta de logs de auditoría
 *
 * Seguridad:
 * - Todos los endpoints requieren autorización mediante Permissions guard
 * - Permiso requerido: 'audit.read'
 * - Validación de DTOs automática
 * - Documentación Swagger completa
 */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Obtener lista de logs de auditoría con paginación y filtros
   * GET /audit/logs
   */
  @Get('logs')
  @HttpCode(HttpStatus.OK)
  @Permissions('audit.read')
  @ApiOperation({
    summary: 'Get audit logs',
    description:
      'Retrieve audit logs with optional filtering and pagination. Returns all audit events sorted by date in descending order.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (starting from 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (max: 100)',
    example: 20,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Global search across action, actorKid, resourceType, endpoint',
    example: 'LOGIN',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Field to sort by',
    example: 'at',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    type: String,
    description: 'Sort order (asc or desc)',
    example: 'desc',
  })
  @ApiQuery({
    name: 'actorKid',
    required: false,
    type: String,
    description: 'Filter by actor KID (invariable user identifier)',
    example: 'user-123',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    type: String,
    description: 'Filter by action performed',
    example: 'LOGIN_SUCCESS',
  })
  @ApiQuery({
    name: 'resourceType',
    required: false,
    type: String,
    description: 'Filter by resource type',
    example: 'user',
  })
  @ApiQuery({
    name: 'result',
    required: false,
    type: String,
    description: 'Filter by result (allow, deny, error)',
    example: 'allow',
  })
  @ApiQuery({
    name: 'severity',
    required: false,
    type: String,
    description: 'Filter by severity level (LOW, MEDIUM, HIGH, CRITICAL)',
    example: 'HIGH',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date in ISO format (inclusive)',
    example: '2026-01-01T00:00:00Z',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date in ISO format (inclusive)',
    example: '2026-01-31T23:59:59Z',
  })
  @ApiOkResponse({
    description: 'List of audit logs',
    schema: {
      example: {
        statusCode: 200,
        message: 'Audit logs retrieved successfully',
        data: [
          {
            _id: '507f1f77bcf86cd799439011',
            requestId: 'req-123',
            at: '2026-01-14T09:30:00Z',
            actorKid: 'user-123',
            actorSub: 'user@example.com',
            action: 'LOGIN_SUCCESS',
            resourceType: 'auth',
            result: 'allow',
            statusCode: 200,
            severity: 'MEDIUM',
          },
        ],
        metadata: {
          requestId: 'req-456',
          userId: 'user-789',
          pagination: {
            total: 100,
            page: 1,
            limit: 20,
            pages: 5,
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - no token provided',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - insufficient permissions (requires audit.read)',
  })
  async findAll(
    @Res() res: Response,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: SortOrder,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('result') result?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('severity') severity?: string,
    @Query('statusCode') statusCode?: string,
    @Query('method') method?: string,
  ): Promise<Response> {
    // Construir parámetros de consulta reutilizable
    const queryParams: QueryParams<AuditFilterParams> = {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search: search?.trim(),
      sortBy: sortBy,
      sortOrder: sortOrder,
      filters: {
        actorId,
        action,
        resourceType,
        result,
        severity,
        startDate,
        endDate,
        statusCode,
        method,
      },
    };

    const apiResponse = await this.auditLogService.findAll(queryParams);
    return res.status(apiResponse.statusCode).json(apiResponse);
  }

  /**
   * Obtener un log de auditoría específico por ID
   * GET /audit/logs/:id
   */
  @Get('logs/:id')
  @HttpCode(HttpStatus.OK)
  @Permissions('audit.read')
  @ApiOperation({
    summary: 'Get audit log by ID',
    description: 'Retrieve a specific audit log entry by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'Audit log ID (MongoDB ObjectId)',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiOkResponse({
    description: 'Audit log found',
    schema: {
      example: {
        statusCode: 200,
        message: 'Audit log retrieved successfully',
        data: {
          _id: '507f1f77bcf86cd799439011',
          requestId: 'req-123',
          at: '2026-01-14T09:30:00Z',
          actorKid: 'user-123',
          actorSub: 'user@example.com',
          action: 'LOGIN_SUCCESS',
          resourceType: 'auth',
          resourceRef: 'auth-123',
          result: 'allow',
          statusCode: 200,
          method: 'POST',
          endpoint: '/api_055/auth/login',
          severity: 'MEDIUM',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Audit log not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - no token provided',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - insufficient permissions (requires audit.read)',
  })
  async findById(
    @Res() res: Response,
    @Param('id') id: string,
  ): Promise<Response> {
    const apiResponse = await this.auditLogService.findById(id);
    return res.status(apiResponse.statusCode).json(apiResponse);
  }

  /**
   * Obtener resumen de auditoría (estadísticas)
   * GET /audit/summary
   */
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @Permissions('audit.read')
  @ApiOperation({
    summary: 'Get audit summary statistics',
    description:
      'Retrieve summary statistics including total events, results distribution, and severity breakdown.',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date in ISO format (inclusive)',
    example: '2026-01-01T00:00:00Z',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date in ISO format (inclusive)',
    example: '2026-01-31T23:59:59Z',
  })
  @ApiOkResponse({
    description: 'Audit summary statistics',
    schema: {
      example: {
        statusCode: 200,
        message: 'Audit summary retrieved successfully',
        data: {
          total: 1500,
          byResult: {
            allow: 1400,
            deny: 80,
            error: 20,
          },
          bySeverity: {
            LOW: 800,
            MEDIUM: 500,
            HIGH: 150,
            CRITICAL: 50,
          },
          timeRange: {
            earliest: '2026-01-01T00:00:00Z',
            latest: '2026-01-31T23:59:59Z',
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - no token provided',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - insufficient permissions (requires audit.read)',
  })
  async getSummary(
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Response> {
    const apiResponse = await this.auditLogService.getSummary(startDate, endDate);
    return res.status(apiResponse.statusCode).json(apiResponse);
  }
}
