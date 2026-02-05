import type { Response } from 'express';

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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiHeader, ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiOperation, ApiUnauthorizedResponse, ApiOkResponse, ApiAcceptedResponse, ApiQuery, ApiNotFoundResponse } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

import { TransactionService } from '../../application/services/transaction.service';
import { TransactionQueryService } from '../../application/services/transaction-query.service';

import {
  CreateTransactionDto,
  ConfirmTransactionDto,
  CreateTransactionResponseDto,
  TransactionPaginatedResponseDto,
} from '../../dto/transactions.dto';

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
@UseGuards(JwtAuthGuard)
@Controller('transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionQueryService: TransactionQueryService,
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
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: SortOrder,
    @Query('status') status?: TransactionStatus,
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

    const response = await this.transactionQueryService.list(queryParams);
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
