import type { Response } from 'express';

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
  ApiHeader,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { Permissions } from 'src/modules/auth/decorators/permissions.decorator';
import { TerminalService } from '../../application/terminal.service';
import { AdminTerminalFiltersDto } from '../../dto/admin-terminal-filters.dto';

@ApiTags('Admin - Terminals')
@ApiBearerAuth('Bearer Token')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@Controller('admin/terminals')
@UseGuards(JwtAuthGuard)
export class AdminTerminalController {
  constructor(private readonly terminalService: TerminalService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Permissions('terminals.admin.read')
  @ApiOperation({
    summary: 'Listar todas las terminales (admin)',
    description:
      'Devuelve todas las terminales del sistema, con filtros opcionales por tenant, tipo, estado y capacidad. Requiere permiso terminals.admin.read.',
  })
  @ApiQuery({
    name: 'tenantId',
    required: false,
    type: String,
    description: 'Filtrar por tenant específico',
    example: 'tenant-001',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    type: String,
    description: 'Filtrar por tipo de terminal',
    example: 'physical_pos',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filtrar por estado de terminal',
    example: 'active',
  })
  @ApiQuery({
    name: 'capability',
    required: false,
    type: String,
    description: 'Filtrar por capacidad de terminal',
    example: 'nfc',
  })
  @ApiOkResponse({
    description: 'Lista de terminales obtenida exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: '5 terminales encontradas',
        data: [
          {
            terminalId: 'term-001',
            tenantId: 'tenant-001',
            name: 'POS Caja Principal',
            type: 'physical_pos',
            capabilities: ['nfc', 'chip'],
            status: 'active',
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para leer terminales (terminals.admin.read)',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async listAll(
    @Res() res: Response,
    @Query() filters: AdminTerminalFiltersDto,
  ): Promise<Response> {
    const response = await this.terminalService.listAllTerminals(filters);
    return res.status(response.statusCode).json(response);
  }

  @Get(':terminalId')
  @HttpCode(HttpStatus.OK)
  @Permissions('terminals.admin.read')
  @ApiOperation({
    summary: 'Obtener terminal por ID (admin)',
    description:
      'Devuelve los detalles de una terminal específica sin restricción de tenant. Requiere permiso terminals.admin.read.',
  })
  @ApiParam({
    name: 'terminalId',
    description: 'ID de la terminal',
    example: 'term-001',
  })
  @ApiOkResponse({
    description: 'Terminal encontrada',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Terminal encontrada',
        data: {
          terminalId: 'term-001',
          tenantId: 'tenant-001',
          name: 'POS Caja Principal',
          type: 'physical_pos',
          capabilities: ['nfc', 'chip'],
          status: 'active',
          location: {
            label: 'Sucursal Centro',
            address: 'Av. Principal 123',
          },
          oauthClientId: 'client-xxx',
          createdAt: '2025-01-15T10:00:00Z',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Terminal no encontrada',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para leer terminales (terminals.admin.read)',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async get(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
  ): Promise<Response> {
    const response = await this.terminalService.getTerminalById(terminalId);
    return res.status(response.statusCode).json(response);
  }

  @Post(':terminalId/suspend')
  @HttpCode(HttpStatus.OK)
  @Permissions('terminals.admin.suspend')
  @ApiOperation({
    summary: 'Suspender terminal (admin)',
    description:
      'Suspende una terminal activa sin restricción de tenant. Desactiva el cliente OAuth asociado. Requiere permiso terminals.admin.suspend.',
  })
  @ApiParam({
    name: 'terminalId',
    description: 'ID de la terminal a suspender',
    example: 'term-001',
  })
  @ApiOkResponse({
    description: 'Terminal suspendida exitosamente por admin',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Terminal suspendida por admin',
        data: {
          terminalId: 'term-001',
          status: 'suspended',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Terminal no encontrada',
  })
  @ApiConflictResponse({
    description: 'Estado inválido para suspensión (terminal no está activa)',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para suspender terminales (terminals.admin.suspend)',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async suspend(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
  ): Promise<Response> {
    const response = await this.terminalService.adminSuspendTerminal(terminalId);
    return res.status(response.statusCode).json(response);
  }

  @Post(':terminalId/revoke')
  @HttpCode(HttpStatus.OK)
  @Permissions('terminals.admin.revoke')
  @ApiOperation({
    summary: 'Revocar terminal (admin)',
    description:
      'Revoca permanentemente una terminal y su cliente OAuth sin restricción de tenant. Una terminal revocada no puede ser reactivada. Requiere permiso terminals.admin.revoke.',
  })
  @ApiParam({
    name: 'terminalId',
    description: 'ID de la terminal a revocar',
    example: 'term-001',
  })
  @ApiOkResponse({
    description: 'Terminal revocada exitosamente por admin',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Terminal revocada por admin',
        data: {
          terminalId: 'term-001',
          status: 'revoked',
          revokedAt: '2025-01-20T15:00:00Z',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Terminal no encontrada',
  })
  @ApiConflictResponse({
    description: 'La terminal ya está revocada',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para revocar terminales (terminals.admin.revoke)',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async revoke(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
  ): Promise<Response> {
    const response = await this.terminalService.adminRevokeTerminal(terminalId);
    return res.status(response.statusCode).json(response);
  }
}
