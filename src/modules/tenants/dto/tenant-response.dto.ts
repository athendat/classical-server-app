import { ApiProperty } from '@nestjs/swagger';
import { TenantStatus } from '../domain/enums';

/**
 * DTO subdocumento para dirección en respuesta
 */
export class BusinessAddressResponseDto {
  @ApiProperty({ example: 'Calle Principal 123' })
  address: string;

  @ApiProperty({ example: 'San José' })
  city: string;

  @ApiProperty({ example: 'San José' })
  state: string;

  @ApiProperty({ example: '10101' })
  zipCode: string;

  @ApiProperty({ example: 'Costa Rica', nullable: true })
  country?: string;
}

/**
 * DTO de respuesta para un Tenant individual
 */
export class TenantResponseDto {
  @ApiProperty({
    description: 'ID único del tenant',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id: string;

  @ApiProperty({
    description: 'Nombre legal del negocio',
    example: 'Mi Empresa S.A.',
  })
  businessName: string;

  @ApiProperty({
    description: 'Nombre del representante legal',
    example: 'Juan Pérez García',
  })
  legalRepresentative: string;

  @ApiProperty({
    description: 'Dirección del negocio',
    type: BusinessAddressResponseDto,
  })
  businessAddress: BusinessAddressResponseDto;

  @ApiProperty({
    description: 'Número de tarjeta enmascarado (****-****-****-XXXX)',
    example: '****-****-****-9010',
  })
  maskedPan: string;

  @ApiProperty({
    description: 'Número de tarjeta desenmascarado (solo si tiene permisos)',
    example: '4532-1234-5678-9010',
    nullable: true,
  })
  unmaskPan?: string;

  @ApiProperty({
    description: 'Email del negocio',
    example: 'contacto@miempresa.com',
  })
  email: string;

  @ApiProperty({
    description: 'Teléfono de contacto',
    example: '55551234',
  })
  phone: string;

  @ApiProperty({
    description: 'Estado actual del tenant',
    enum: TenantStatus,
    example: TenantStatus.PENDING_REVIEW,
  })
  status: TenantStatus;

  @ApiProperty({
    description: 'ID del usuario que creó el tenant',
    example: 'user-123',
  })
  createdBy: string;

  @ApiProperty({
    description: 'Notas adicionales',
    example: 'Negocio de importación y exportación',
    nullable: true,
  })
  notes?: string;

  @ApiProperty({
    description: 'Fecha de creación',
    example: '2026-02-01T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Fecha de última actualización',
    example: '2026-02-01T10:30:00Z',
  })
  updatedAt: Date;
}
