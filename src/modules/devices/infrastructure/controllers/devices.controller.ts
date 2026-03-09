/**
 * Controller: DevicesController
 * 
 * Controlador unificado para gestión de dispositivos.
 * Integra endpoints para:
 * - Intercambio seguro de claves públicas ECDH
 * - Rotación de claves
 * - Revocación/eliminación de dispositivos
 * - Consulta de información y historial
 */

import type { Response } from 'express';

import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBearerAuth, ApiTags, ApiHeader, ApiSecurity } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentActor } from 'src/modules/auth/decorators/current-actor.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import type { Actor } from 'src/common/interfaces/actor.interface';

// Services
import { DeviceKeyExchangeService } from '../../application/device-key-exchange.service';
import { DeviceKeyRotationService } from '../../application/device-key-rotation.service';
import { DeviceKeyRevocationService } from '../../application/device-key-revocation.service';

// DTOs
import { DeviceKeyExchangeRequestDto } from '../../dto/device-key-exchange-request.dto';
import { DeviceKeyExchangeResponseDto } from '../../dto/device-key-exchange-response.dto';
import { DeviceKeyRotationRequestDto } from '../../dto/device-key-rotation-request.dto';
import { DeviceInfoDto } from '../../dto/device-info.dto';
import { KeyRotationHistoryDto } from '../../dto/key-rotation-history.dto';

// Guards
import { DeviceOwnershipGuard } from '../guards/device-ownership.guard';

@Controller('/devices')
@ApiTags('Devices - Key Exchange & Management')
@ApiBearerAuth('Bearer Token')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-api-key',
  required: true,
})
@UseGuards(JwtAuthGuard)
@UseGuards(AuthGuard('jwt'))
export class DevicesController {
  private readonly logger = new Logger(DevicesController.name);

  constructor(
    private readonly keyExchangeService: DeviceKeyExchangeService,
    private readonly rotationService: DeviceKeyRotationService,
    private readonly revocationService: DeviceKeyRevocationService,
  ) {}

  /**
   * ============================================
   * Key Exchange Endpoints
   * ============================================
   */

  @Post('key-exchange')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AuditInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Intercambiar claves públicas ECDH',
    description:
      'Dispositivo envía su clave pública ECDH P-256, servidor responde con su clave pública + salt para HKDF derivación.',
  })
  @ApiResponse({
    status: 201,
    description: 'Intercambio exitoso - nuevas claves generadas',
    type: DeviceKeyExchangeResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Clave pública inválida o formato incorrecto',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado o JWT inválido',
  })
  @ApiResponse({
    status: 409,
    description: 'Dispositivo duplicado - rotación requerida',
  })
  async exchangeKeys(
    @Res() res: Response,
    @CurrentActor() actor: Actor,
    @Body() request: DeviceKeyExchangeRequestDto,
  ): Promise<Response> {
    const response = await this.keyExchangeService.exchangePublicKeyWithDevice(actor.actorId, request);
    return res.status(response.statusCode).json(response);
  }

  /**
   * ============================================
   * Device List & Info Endpoints
   * ============================================
   */

  @Get('list')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Listar dispositivos activos del usuario',
    description: 'Retorna lista de dispositivos registrados y activos',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de dispositivos',
    type: [DeviceInfoDto],
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async listDevices(@CurrentActor() actor: Actor): Promise<DeviceInfoDto[]> {
    this.logger.log(`Listing devices | userId: ${actor.actorId}`);
    // TODO: Implementar listado de dispositivos activos del usuario
    return [];
  }

  @Get(':deviceId')
  @UseGuards(JwtAuthGuard, DeviceOwnershipGuard)
  @ApiOperation({
    summary: 'Obtener información de un dispositivo',
    description: 'Retorna detalles del dispositivo incluyendo estado y fechas',
  })
  @ApiResponse({
    status: 200,
    description: 'Información del dispositivo',
    type: DeviceInfoDto,
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuario no es propietario del dispositivo',
  })
  @ApiResponse({
    status: 404,
    description: 'Dispositivo no encontrado',
  })
  async getDeviceInfo(
    @CurrentActor() actor: Actor,
    @Param('deviceId') deviceId: string,
  ): Promise<DeviceInfoDto> {
    this.logger.log(`Getting device info | userId: ${actor.actorId} | deviceId: ${deviceId}`);
    // TODO: Implementar obtención de información del dispositivo
    return {} as DeviceInfoDto;
  }

  /**
   * ============================================
   * Key Rotation Endpoints
   * ============================================
   */

  @Post(':deviceId/rotate-key')
  @UseGuards(JwtAuthGuard, DeviceOwnershipGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotar clave de dispositivo manualmente',
    description:
      'Usuario inicia rotación manual de clave. Genera nueva clave del servidor y marca la anterior como ROTATED.',
  })
  @ApiResponse({
    status: 200,
    description: 'Nueva clave generada exitosamente',
    type: DeviceKeyExchangeResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuario no es propietario del dispositivo',
  })
  @ApiResponse({
    status: 429,
    description: 'Límite de rotaciones por 24h excedido',
  })
  async rotateKey(
    @CurrentActor() actor: Actor,
    @Param('deviceId') deviceId: string,
    @Body() request?: DeviceKeyRotationRequestDto,
  ): Promise<DeviceKeyExchangeResponseDto> {
    this.logger.log(
      `Rotating device key | userId: ${actor.actorId} | deviceId: ${deviceId}`,
    );

    return this.rotationService.rotateDeviceKey(
      deviceId,
      actor.actorId,
      request?.device_public_key,
    );
  }

  /**
   * ============================================
   * Key Revocation Endpoints
   * ============================================
   */

  @Delete(':deviceId')
  @UseGuards(JwtAuthGuard, DeviceOwnershipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revocar clave de dispositivo',
    description:
      'Marca dispositivo como REVOKED. No se elimina del registro (soft delete) para auditoría.',
  })
  @ApiResponse({
    status: 204,
    description: 'Dispositivo revocado exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuario no es propietario del dispositivo',
  })
  @ApiResponse({
    status: 404,
    description: 'Dispositivo no encontrado',
  })
  async revokeDevice(
    @CurrentActor() actor: Actor,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    this.logger.log(
      `Revoking device key | userId: ${actor.actorId} | deviceId: ${deviceId}`,
    );

    await this.revocationService.revokeDeviceKey(deviceId, actor.actorId);
  }

  /**
   * ============================================
   * Key History / Audit Endpoints
   * ============================================
   */

  @Get(':deviceId/key-history')
  @UseGuards(JwtAuthGuard, DeviceOwnershipGuard)
  @ApiOperation({
    summary: 'Obtener historial de rotaciones de clave',
    description: 'Retorna registro de auditoría de todas las rotaciones del dispositivo',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de rotaciones con paginación',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/KeyRotationHistoryDto' } },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuario no es propietario del dispositivo',
  })
  async getKeyHistory(
    @CurrentActor() actor: Actor,
    @Param('deviceId') deviceId: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<{ data: KeyRotationHistoryDto[]; total: number; limit: number; offset: number }> {
    this.logger.log(
      `Getting key history | userId: ${actor.actorId} | deviceId: ${deviceId} | limit: ${limit} | offset: ${offset}`,
    );

    // TODO: Implementar obtención de historial con paginación
    return { data: [], total: 0, limit, offset };
  }
}
