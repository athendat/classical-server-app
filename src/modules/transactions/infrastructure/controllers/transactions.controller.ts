import type { Request, Response } from 'express';

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpStatus,
  HttpCode,
  Logger,
  UseGuards,
  Res,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiHeader, ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiOperation, ApiUnauthorizedResponse, ApiOkResponse, ApiAcceptedResponse, ApiQuery, ApiNotFoundResponse } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

import { TransactionService } from '../../application/services/transaction.service';
import { TransactionQueryService } from '../../application/services/transaction-query.service';
import { DashboardService } from '../../application/services/dashboard.service';

import {
  CreateTransactionDto,
  ConfirmTransactionDto,
  CreateTransactionResponseDto,
  TransactionPaginatedResponseDto,
} from '../../dto/transactions.dto';

import { DashboardStatsQueryDto, DashboardStatsResponseDto } from '../../dto/dashboard.dto';

import { Transaction, TransactionStatus } from '../../domain/entities/transaction.entity';
import { ApiResponse } from 'src/common/types';
import type { QueryParams, SortOrder } from 'src/common/types';


/**
 * Controlador de transacciones
 * Endpoints para crear, confirmar, cancelar y listar transacciones
 */
@ApiTags('Transactions')
@ApiBearerAuth('Bearer Token')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@ApiHeader({
  name: 'x-context-app',
  required: false,
})
@UseGuards(JwtAuthGuard)
@UseGuards(AuthGuard('jwt'))
@Controller('transactions')
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionQueryService: TransactionQueryService,
    private readonly dashboardService: DashboardService,
  ) { }

  /**
   * Crea una nueva transacción
   * POST /transactions
   * Body: { TransactionId, customerId, ref, amount, ttlMinutes? }
   * Response: { id, ref, no, amount, expiresAt, payload, signature }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nueva transacción',
    description:
      'Crea una nueva transacción.',
  })
  @ApiCreatedResponse({
    description: 'Transacción creada exitosamente',
    type: CreateTransactionResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos en la solicitud',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para crear transacciones',
  })
  async create(
    @Res() res: Response,
    @Body() dto: CreateTransactionDto,
  ): Promise<Response> {
    const response = await this.transactionService.create(dto);
    return res.status(response.statusCode).json(response);

  }

  /**
   * Confirma una transacción con cardId y firma
   * POST /transactions/confirm
   * Body: { transactionId,cardId, signature }
   * Response: Transaction completa
   */
  @Post('confirm')
  @ApiOperation({
    summary: 'Confirmar transacción',
    description: 'Confirma una transacción con cardId y firma',
  })
  @ApiAcceptedResponse({
    description: 'Transacción confirmada exitosamente',
    type: Transaction,
  })
  @ApiConflictResponse({
    description: 'Conflicto al confirmar la transacción (ej., ya confirmada o cancelada)',
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos en la solicitud',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para confirmar esta transacción',
  })
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Res() res: Response,
    @Body() dto: ConfirmTransactionDto,
  ): Promise<Response> {
    const response = await this.transactionService.confirm(dto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtiene estadísticas del dashboard
   * GET /transactions/dashboard/statistics?dateFrom=...&dateTo=...&tenantId=...
   * Response: Estadísticas agregadas
   */
  @Get('dashboard/statistics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener estadísticas del dashboard',
    description:
      'Obtiene estadísticas agregadas de transacciones, clientes, tarjetas y tendencias para un rango de fechas. ' +
      'Admins ven datos globales. Tenants admin ven datos de su tenant.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    type: String,
    description: 'Fecha inicial del rango (ISO 8601)',
    example: '2026-02-01T00:00:00Z',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    type: String,
    description: 'Fecha final del rango (ISO 8601)',
    example: '2026-02-12T23:59:59Z',
  })
  @ApiQuery({
    name: 'tenantId',
    required: false,
    type: String,
    description: 'ID del tenant (solo para admins, si se omite retorna datos globales)',
    example: 'tenant-uuid',
  })
  @ApiOkResponse({
    description: 'Estadísticas obtenidas exitosamente',
    type: DashboardStatsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Fechas inválidas o rango incorrecto',
  })
  @ApiUnauthorizedResponse({
    description: 'No autorizado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para acceder a estadísticas',
  })
  async getStatistics(
    @Res() res: Response,
    @Query() query: DashboardStatsQueryDto,
  ): Promise<Response> {
    const response = await this.dashboardService.getStatistics(query);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Cancela una transacción
   * POST /transactions/:id/cancel
   * Response: Transaction actualizada
  */
  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancelar transacción',
    description: 'Cancela una transacción específica por su ID',
  })
  @ApiAcceptedResponse({
    description: 'Transacción cancelada exitosamente',
    type: Transaction,
  })
  @ApiConflictResponse({
    description: 'Conflicto al cancelar la transacción (ej., ya confirmada o cancelada)',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para cancelar esta transacción',
  })
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Res() res: Response,
    @Param('id') transactionId: string,
  ): Promise<Response> {
    const response = await this.transactionService.cancel(transactionId);
    return res.status(response.statusCode).json(response);
  }

  /**
   * Lista transacciones con filtrado inteligente por rol
   * GET /transactions?status=new&TransactionId=...&skip=0&take=20
   *
   * Filtrado por roleKey del usuario:
   * - user: solo sus propias transacciones (customerId)
   * - merchant: transacciones de su Transaction
   * - admin/otros: puede filtrar por cualquier parámetro
   */
  @Get()
  @HttpCode(HttpStatus.OK)
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
    description: 'Filter by transaction status',
    example: 'new',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Inicio del rango (ISO 8601) sobre createdAt',
    example: '2026-05-03T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'Fin del rango (ISO 8601) sobre createdAt',
    example: '2026-06-02T23:59:59.999Z',
  })
  @ApiOkResponse({
    description: 'Transactions recuperados',
    type: TransactionPaginatedResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para leer Transactions',
  })
  async list(
    @Res() res: Response,
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: SortOrder,
    @Query('status') status?: TransactionStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<Response> {
    // Construimos parámetros de consulta
    const queryParams: QueryParams = {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
      sortBy: sortBy,
      sortOrder: sortOrder,
      search: search?.trim(),
      filters: {
        ...(status ? { status } : {}),
      },
    };

    // Obtener la app desde el header x-context-app para aplicar lógica de filtrado por rol
    const contextApp = req.header('x-context-app');

    // Issue #28: rango de fechas (createdAt) opcional.
    const response = await this.transactionQueryService.list(queryParams, contextApp, { from, to });
    return res.status(response.statusCode).json(response);
  }

  /**
   * Obtiene detalles de una transacción específica
   * GET /transactions/:id
   * Response: Transaction completa (con validación de permisos)
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalles de una transacción',
    description: 'Obtiene los detalles de una transacción específica por su ID',
  })
  @ApiOkResponse({
    description: 'Detalles de la transacción recuperados',
    type: Transaction,
  })
  @ApiNotFoundResponse({
    description: 'Transacción no encontrada',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para ver esta transacción',
  })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Res() res: Response,
    @Param('id') transactionId: string,
  ): Promise<Response> {
    const response = await this.transactionQueryService.findOne(transactionId);
    return res.status(response.statusCode).json(response);
  }

}
