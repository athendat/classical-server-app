import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantStatus } from '../domain/enums';

/**
 * DTO para cambiar el estado de un Tenant
 */
export class TransitionTenantStateDto {
  @ApiProperty({
    description: 'Estado destino',
    enum: TenantStatus,
    example: TenantStatus.APPROVED,
  })
  @IsEnum(TenantStatus, {
    message: `El estado debe ser uno de: ${Object.values(TenantStatus).join(', ')}`,
  })
  targetState: TenantStatus;

  @ApiProperty({
    description: 'Comentario opcional sobre la transición de estado',
    example: 'Se solicitan documentos adicionales de registro mercantil',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
