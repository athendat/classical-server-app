import type { Response } from 'express';

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { TerminalService } from '../../application/terminal.service';
import { CreateTerminalDto } from '../../dto/create-terminal.dto';
import { UpdateTerminalDto } from '../../dto/update-terminal.dto';
import type { TerminalFilters } from '../../domain/ports/terminal-repository.port';

@ApiTags('Terminals')
@ApiBearerAuth('Bearer Token')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@Controller('terminals')
@UseGuards(JwtAuthGuard)
export class TerminalController {
  constructor(private readonly terminalService: TerminalService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nueva terminal',
    description:
      'Crea una terminal para el tenant del usuario autenticado. Genera automáticamente un cliente OAuth con los scopes correspondientes al tipo de terminal.',
  })
  @ApiCreatedResponse({
    description: 'Terminal creada exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 201,
        message: 'Terminal creada exitosamente',
        data: {
          terminal: {
            terminalId: 'term-001',
            tenantId: 'tenant-001',
            name: 'POS Caja Principal',
            type: 'physical_pos',
            capabilities: ['nfc', 'chip'],
            status: 'active',
            oauthClientId: 'client-xxx',
            createdAt: '2025-01-15T10:00:00Z',
          },
          credentials: {
            clientId: 'client-xxx',
            clientSecret: 'secret-xxx',
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o error en validación',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async create(
    @Res() res: Response,
    @Body() dto: CreateTerminalDto,
  ): Promise<Response> {
    const response = await this.terminalService.createTerminal(dto);
    return res.status(response.statusCode).json(response);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Listar terminales del tenant',
    description:
      'Devuelve todas las terminales del tenant del usuario autenticado, con filtros opcionales por tipo, estado y capacidad.',
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
        message: '3 terminales encontradas',
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
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async list(
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('capability') capability?: string,
  ): Promise<Response> {
    const filters: TerminalFilters = {};
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (capability) filters.capability = capability;

    const response = await this.terminalService.listTerminals(filters);
    return res.status(response.statusCode).json(response);
  }

  @Get(':terminalId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener terminal por ID',
    description: 'Devuelve los detalles de una terminal específica del tenant del usuario autenticado.',
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
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async get(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
  ): Promise<Response> {
    const response = await this.terminalService.getTerminal(terminalId);
    return res.status(response.statusCode).json(response);
  }

  @Post(':terminalId/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspender terminal',
    description:
      'Suspende una terminal activa del tenant del usuario autenticado. Desactiva el cliente OAuth asociado. Solo terminales con estado "active" pueden ser suspendidas.',
  })
  @ApiParam({
    name: 'terminalId',
    description: 'ID de la terminal a suspender',
    example: 'term-001',
  })
  @ApiOkResponse({
    description: 'Terminal suspendida exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Terminal suspendida',
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
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async suspend(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
  ): Promise<Response> {
    const response = await this.terminalService.suspendTerminal(terminalId);
    return res.status(response.statusCode).json(response);
  }

  @Post(':terminalId/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivar terminal',
    description:
      'Reactiva una terminal suspendida del tenant del usuario autenticado. Reactiva el cliente OAuth asociado. Solo terminales con estado "suspended" pueden ser reactivadas.',
  })
  @ApiParam({
    name: 'terminalId',
    description: 'ID de la terminal a reactivar',
    example: 'term-001',
  })
  @ApiOkResponse({
    description: 'Terminal reactivada exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Terminal reactivada',
        data: {
          terminalId: 'term-001',
          status: 'active',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Terminal no encontrada',
  })
  @ApiConflictResponse({
    description: 'Estado inválido para reactivación (terminal no está suspendida o está revocada)',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async reactivate(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
  ): Promise<Response> {
    const response = await this.terminalService.reactivateTerminal(terminalId);
    return res.status(response.statusCode).json(response);
  }

  @Post(':terminalId/rotate-credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotar credenciales de terminal',
    description:
      'Revoca el cliente OAuth actual y genera uno nuevo con los mismos scopes. Solo terminales activas pueden rotar credenciales.',
  })
  @ApiParam({
    name: 'terminalId',
    description: 'ID de la terminal',
    example: 'term-001',
  })
  @ApiOkResponse({
    description: 'Credenciales rotadas exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Credenciales rotadas exitosamente',
        data: {
          clientId: 'new-client-xxx',
          clientSecret: 'new-secret-xxx',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Terminal no encontrada',
  })
  @ApiConflictResponse({
    description: 'Solo se pueden rotar credenciales de terminales activas',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async rotateCredentials(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
  ): Promise<Response> {
    const response = await this.terminalService.rotateCredentials(terminalId);
    return res.status(response.statusCode).json(response);
  }

  @Post(':terminalId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revocar terminal',
    description:
      'Revoca permanentemente una terminal y su cliente OAuth. Una terminal revocada no puede ser reactivada.',
  })
  @ApiParam({
    name: 'terminalId',
    description: 'ID de la terminal a revocar',
    example: 'term-001',
  })
  @ApiOkResponse({
    description: 'Terminal revocada exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Terminal revocada',
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
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async revoke(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
  ): Promise<Response> {
    const response = await this.terminalService.revokeTerminal(terminalId);
    return res.status(response.statusCode).json(response);
  }

  @Patch(':terminalId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar terminal',
    description:
      'Actualiza los datos de una terminal (nombre, ubicación, capacidades, información del dispositivo). Todos los campos son opcionales.',
  })
  @ApiParam({
    name: 'terminalId',
    description: 'ID de la terminal a actualizar',
    example: 'term-001',
  })
  @ApiOkResponse({
    description: 'Terminal actualizada exitosamente',
    schema: {
      example: {
        ok: true,
        statusCode: 200,
        message: 'Terminal actualizada',
        data: {
          terminalId: 'term-001',
          tenantId: 'tenant-001',
          name: 'POS Caja Principal Actualizado',
          type: 'physical_pos',
          capabilities: ['nfc', 'chip', 'qr_scan'],
          status: 'active',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos',
  })
  @ApiNotFoundResponse({
    description: 'Terminal no encontrada',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async update(
    @Res() res: Response,
    @Param('terminalId') terminalId: string,
    @Body() dto: UpdateTerminalDto,
  ): Promise<Response> {
    const response = await this.terminalService.updateTerminal(terminalId, dto);
    return res.status(response.statusCode).json(response);
  }
}
