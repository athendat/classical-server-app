import type { Response } from 'express';

import {
  Controller,
  Post,
  HttpStatus,
  HttpCode,
  Logger,
  Res,
  Get,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiSecurity,
} from '@nestjs/swagger';

import { TestTransactionService } from '../../application/services/test-transaction.service';
import { CreateTransactionResponseDto } from '../../dto/transactions.dto';

/**
 * Controlador de transacciones de prueba
 * Endpoints públicos para generar transacciones simuladas en ambiente DEVELOPMENT
 * Sin requerimiento de autenticación
 */
@ApiTags('Transactions - Testing')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@Controller('transactions-test')
export class TestTransactionsController {

  constructor(
    private readonly testTransactionService: TestTransactionService,
  ) {}

  /**
   * Crea una transacción de prueba (solo en ambiente DEVELOPMENT)
   * GET /transactions/test
   * Response: Transacción de prueba con datos simulados
   *
   * Selector aleatorio de tenant, monto entre 50-1000 USD, ref y ttl aleatorios
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crear transacción de prueba (DEVELOPMENT only)',
    description:
      'Crea una transacción de prueba con datos simulados. ' +
      'Solo disponible en ambiente DEVELOPMENT. ' +
      'Genera un tenant aleatorio, monto entre 50-1000 USD, y referencia aleatoria. ' +
      'No requiere autenticación.',
  })
  @ApiCreatedResponse({
    description: 'Transacción de prueba creada exitosamente',
    type: CreateTransactionResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'No hay tenants disponibles o error en la generación',
  })
  @ApiForbiddenResponse({
    description: 'Ambiente no es DEVELOPMENT, transacciones de prueba no permitidas',
  })
  async getTestTransaction(
    @Res() res: Response,
  ): Promise<Response> {
    const response = await this.testTransactionService.getTestTransaction();
    return res.status(response.statusCode).json(response);
  }
}
