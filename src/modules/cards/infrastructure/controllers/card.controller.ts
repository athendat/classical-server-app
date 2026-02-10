import type { Response } from 'express';

import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Query,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiSecurity,
  ApiHeader,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiInternalServerErrorResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

import { CardsService } from '../../application/cards.service';

import { CreateCardDto } from '../../dto/create-card.dto';
import { CardResponseDto } from '../../dto/card-response.dto';

import { ApiResponse } from 'src/common/types';
import type { QueryParams, SortOrder } from 'src/common/types';
/**
 * Card Controller - HTTP endpoints for card operations
 * Base path: /cards
 */
@Controller('cards')
@ApiBearerAuth('Bearer Token')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@UseGuards(JwtAuthGuard)
export class CardController {
  constructor(private readonly cardsService: CardsService) { }

  /**
   * POST /cards - Register a new card
   * @returns 201 Created or 409 Conflict (duplicate card type)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nueva tarjeta',
    description:
      'Crea un nuevo negocio (tarjeta) con estado inicial PENDING_REVIEW. El PAN  se valida con el algoritmo Luhn y el PIN se almacenan en Vault.',
  })
  @ApiCreatedResponse({
    description: 'Tarjeta creada exitosamente',
    type: ApiResponse<CardResponseDto>,
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o PAN no cumple validación Luhn',
  })
  @ApiConflictResponse({
    description:
      'El usuario ha registrado un tarjeta de este tipo. Solo se permite una tarjeta por Personal y una Empresarial por usuario.',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para crear tarjetas',
  })
  async registerCard(
    @Body() createCardDto: CreateCardDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.cardsService.registerCard(createCardDto);
    return res.status(response.statusCode).json(response);
  }

  /**
   * GET /cards - List all cards for the current user
   * @returns 200 OK with array of cards
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener tarjetas del usuario',
    description:
      'Obtiene todas las tarjetas registradas para el usuario autenticado. Retorna información de tarjetas con PAN enmascarado por seguridad.',
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
      'Search query to filter cards by cardholderName, last4, or cardType',
    example: 'personal',
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
    name: 'userId',
    required: false,
    type: String,
    description: 'Filter cards by user ID',
    example: 'user123',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    enum: ['ACTIVE', 'BLOCKED', 'EXPIRED'],
    description: 'Filter cards by status',
    example: 'active',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    type: String,
    enum: ['PERSONAL', 'BUSINESS'],
    description: 'Filter cards by type',
    example: 'personal',
  })
  @ApiOkResponse({
    description: 'Tarjetas obtenidas exitosamente',
    type: ApiResponse<CardResponseDto[]>,
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para ver tarjetas',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async listCards(
    @Res() res: Response,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: SortOrder,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ): Promise<Response> {
    // Construimos parámetros de consulta
    const queryParams: QueryParams = {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
      sortBy: sortBy,
      sortOrder: sortOrder,
      search: search?.trim(),
      filters: {
        ...(userId ? { userId: userId.trim() } : {}),
        ...(status ? { status: status?.trim().toUpperCase() } : {}),
        ...(type ? { type: type?.trim().toUpperCase() } : {}),
      },
    };
    const response = await this.cardsService.list(queryParams);
    return res.status(response.statusCode).json(response);
  }

  /**
   * GET /cards/:id - Get card details by ID
   * @returns 200 OK with card details
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener detalles de una tarjeta',
    description:
      'Obtiene todos los detalles de una tarjeta específica para el usuario autenticado. Retorna información de la tarjeta con PAN enmascarado por seguridad.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    description: 'ID of the card to retrieve',
    example: 'card123',
  })
  @ApiOkResponse({
    description: 'Detalles de la tarjeta obtenidos exitosamente',
    type: ApiResponse<CardResponseDto>,
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para ver tarjetas',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async findById(
    @Res() res: Response,
    @Param('id') id: string,
  ): Promise<Response> {
    const response = await this.cardsService.findById(id);
    return res.status(response.statusCode).json(response);
  }

  /**
   * GET /cards/mine - List cards for the current user
   * @returns 200 OK with array of cards
   */
  @Get('/mine')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener tarjetas del usuario',
    description:
      'Obtiene todas las tarjetas registradas para el usuario autenticado. Retorna información de tarjetas con PAN enmascarado por seguridad.',
  })
  @ApiOkResponse({
    description: 'Tarjetas obtenidas exitosamente',
    type: ApiResponse<CardResponseDto[]>,
  })
  @ApiUnauthorizedResponse({
    description: 'Falta x-api-key o es inválida',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para ver tarjetas',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async listCardsForUser(@Res() res: Response): Promise<Response> {
    const response = await this.cardsService.listCardsForUser();
    return res.status(response.statusCode).json(response);
  }
}
