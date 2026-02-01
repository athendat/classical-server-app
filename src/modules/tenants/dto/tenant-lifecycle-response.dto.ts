import { ApiProperty } from '@nestjs/swagger';
import { TenantStatus } from '../domain/enums';

/**
 * DTO subdocumento para información del usuario en lifecycle
 */
class TriggeredByResponseDto {
  @ApiProperty({ example: 'user-123' })
  userId: string;

  @ApiProperty({ example: 'admin@example.com' })
  username: string;

  @ApiProperty({ example: 'admin' })
  roleKey: string;
}

/**
 * DTO de respuesta para un evento en el ciclo de vida del tenant
 */
export class TenantLifecycleEventResponseDto {
  @ApiProperty({
    description: 'ID único del evento de lifecycle',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id: string;

  @ApiProperty({
    description: 'ID del tenant',
    example: 'tenant-123',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Estado anterior',
    enum: TenantStatus,
    example: TenantStatus.PENDING_REVIEW,
  })
  fromState: TenantStatus;

  @ApiProperty({
    description: 'Estado nuevo',
    enum: TenantStatus,
    example: TenantStatus.APPROVED,
  })
  toState: TenantStatus;

  @ApiProperty({
    description: 'Información del usuario que disparó la transición',
    type: TriggeredByResponseDto,
  })
  triggeredBy: TriggeredByResponseDto;

  @ApiProperty({
    description: 'Comentario opcional',
    example: 'Se solicitan documentos fiscales',
    nullable: true,
  })
  comment?: string;

  @ApiProperty({
    description: 'Timestamp de la transición',
    example: '2026-02-01T10:30:00Z',
  })
  timestamp: Date;
}

/**
 * DTO para respuesta paginada del historial de lifecycle
 */
export class TenantLifecyclePaginatedResponseDto {
  @ApiProperty({
    description: 'Array de eventos del ciclo de vida',
    type: [TenantLifecycleEventResponseDto],
  })
  data: TenantLifecycleEventResponseDto[];

  @ApiProperty({
    description: 'Metadatos de paginación',
  })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
