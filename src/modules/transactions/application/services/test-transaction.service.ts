import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { v4 as uuidv4 } from 'uuid';

import { AsyncContextService } from 'src/common/context';
import { TransactionService } from './transaction.service';

import { TenantsRepository } from 'src/modules/tenants/infrastructure/adapters/tenant.repository';

import { CreateTransactionDto } from '../../dto/transactions.dto';
import { CreateTransactionResponseDto } from '../../dto/transactions.dto';

import { ApiResponse } from 'src/common/types';

/**
 * Servicio para crear transacciones de prueba
 * Solo disponible en ambiente DEVELOPMENT
 * Simula la creación de transacciones con datos aleatorios y tenants existentes
 */
@Injectable()
export class TestTransactionService {
  private readonly logger = new Logger(TestTransactionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly transactionService: TransactionService,
    private readonly tenantsRepository: TenantsRepository,
    private readonly asyncContextService: AsyncContextService,
  ) {}

  /**
   * Verifica si el ambiente permite crear transacciones de prueba
   */
  private isTestEnvironmentAllowed(): boolean {
    const environment = this.configService.get<string>('ENVIRONMENT') || process.env.ENVIRONMENT;
    return environment === 'DEVELOPMENT';
  }

  /**
   * Obtiene un tenant aleatorio de la base de datos
   */
  private async getRandomTenant() {
    try {
      // Obtener todos los tenants (primera página con límite alto)
      const result = await this.tenantsRepository.findAll(
        {},
        { skip: 0, limit: 1000 },
      );

      if (!result.data || result.data.length === 0) {
        throw new BadRequestException('No hay tenants disponibles en la base de datos');
      }

      // Seleccionar uno aleatorio
      const randomIndex = Math.floor(Math.random() * result.data.length);
      return result.data[randomIndex];
    } catch (error: any) {
      this.logger.error(`Error obteniendo tenant aleatorio: ${error.message}`, error);
      throw new BadRequestException('No se pudo obtener un tenant aleatorio');
    }
  }

  /**
   * Genera un monto aleatorio entre 50 y 1000 USD (en centavos)
   */
  private generateRandomAmount(): number {
    // Rango: 50 USD (5000 centavos) a 1000 USD (100000 centavos)
    const minCents = 5000;
    const maxCents = 100000;
    return Math.floor(Math.random() * (maxCents - minCents + 1)) + minCents;
  }

  /**
   * Genera una referencia de prueba aleatoria
   */
  private generateRandomRef(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let ref = 'TEST-';
    for (let i = 0; i < 10; i++) {
      ref += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return ref;
  }

  /**
   * Crea una transacción de prueba con datos aleatorios
   * Solo funciona en ambiente DEVELOPMENT
   */
  async getTestTransaction(): Promise<ApiResponse<CreateTransactionResponseDto>> {
    // Validar ambiente
    if (!this.isTestEnvironmentAllowed()) {
      this.logger.warn('Intento de crear transacción de prueba en ambiente no permitido');
      throw new ForbiddenException(
        'Las transacciones de prueba solo están disponibles en ambiente DEVELOPMENT',
      );
    }

    try {
      // Obtener tenant aleatorio
      const randomTenant = await this.getRandomTenant();

      // Generar datos de prueba
      const amount = this.generateRandomAmount();
      const ref = this.generateRandomRef();
      const intentId = uuidv4();

      this.logger.log(
        `Creando transacción de prueba: tenantId=${randomTenant.id}, amount=${amount}, ref=${ref}`,
      );

      // Crear DTO de transacción
      const dto: CreateTransactionDto = {
        intentId,
        ref,
        amount,
        ttlMinutes: 60, // TTL fijo de 60 minutos
      };

      // Preparar el contexto del actor para el tenant aleatorio
      const actorContext = {
        actor: {
          actorId: randomTenant.id,
          tenantId: randomTenant.id,
          actorType: 'service' as const,
          sub: `svc:${randomTenant.id}`,
        },
      };

      // Ejecutar la creación dentro del contexto del tenant
      const response = (this.asyncContextService as any).run(
        actorContext,
        () => this.transactionService.create(dto),
      ) as Promise<any>;

      const result = await response;

      if (result.ok) {
        this.logger.log(
          `Transacción de prueba creada exitosamente: id=${result.data?.id}, tenant=${randomTenant.id}`,
        );
      } else {
        this.logger.warn(
          `Error al crear transacción de prueba: ${result.message}`,
        );
      }

      return result;
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error creando transacción de prueba: ${errorMsg}`, error);

      // Si es una excepción conocida (BadRequestException, ForbiddenException), relanzarla
      if (error.getStatus) {
        throw error;
      }

      // Si no, retornar error genérico
      return ApiResponse.fail<CreateTransactionResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error al crear transacción de prueba',
        'Error desconocido',
      );
    }
  }
}
