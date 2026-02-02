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
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
// import { PermissionsGuard } from 'src/modules/authz/guards/permissions.guard';

import { Permissions } from 'src/modules/auth/decorators/permissions.decorator';

import { CardService } from '../../application/card.service';

import { CreateCardDto } from '../../dto/create-card.dto';
import { CardResponseDto } from '../../dto/card-response.dto';

import { ApiResponse } from 'src/common/types/api-response.type';

/**
 * Card Controller - HTTP endpoints for card operations
 * Base path: /cards
 */
@Controller('cards')
@ApiBearerAuth('access-token')
@ApiSecurity('access-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@UseGuards(JwtAuthGuard)
export class CardController {
  constructor(private readonly cardService: CardService) {}

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
    description: 'No autenticado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para crear tarjetas',
  })
  async registerCard(
    @Body() createCardDto: CreateCardDto,
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.cardService.registerCard(createCardDto);
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
  @ApiOkResponse({
    description: 'Tarjetas obtenidas exitosamente',
    type: ApiResponse<CardResponseDto[]>,
  })
  @ApiUnauthorizedResponse({
    description: 'No autenticado',
  })
  @ApiForbiddenResponse({
    description: 'Sin permisos para ver tarjetas',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error interno del servidor',
  })
  async listCards(@Res() res: Response): Promise<Response> {
    const response = await this.cardService.listCardsForUser();
    return res.status(response.statusCode).json(response);
  }
}
