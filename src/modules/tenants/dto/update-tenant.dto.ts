import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsPhone } from 'src/common/validators';
import { BusinessAddressDto } from './create-tenant.dto';

/**
 * DTO para actualizar un Tenant existente
 * Todos los campos son opcionales
 */
export class UpdateTenantDto {
  @ApiProperty({
    description: 'Nombre legal del negocio',
    example: 'Mi Empresa S.A.',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: 'El nombre legal del negocio debe ser una cadena de texto.',
  })
  @MaxLength(255, {
    message: 'El nombre legal del negocio no puede exceder 255 caracteres.',
  })
  businessName?: string;

  @ApiProperty({
    description: 'Nombre del representante legal',
    example: 'Juan Pérez García',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: 'El nombre del representante legal debe ser una cadena de texto.',
  })
  @MaxLength(255, {
    message:
      'El nombre del representante legal no puede exceder 255 caracteres.',
  })
  legalRepresentative?: string;

  @ApiProperty({
    description: 'Dirección del negocio',
    type: BusinessAddressDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested({ message: 'La dirección del negocio no es válida.' })
  @Type(() => BusinessAddressDto)
  businessAddress?: BusinessAddressDto;

  @ApiProperty({
    description: 'Email del negocio',
    example: 'contacto@miempresa.com',
    required: false,
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico del negocio no es válido.' })
  email?: string;

  @ApiProperty({
    description: 'Teléfono de contacto',
    example: '55551234',
    required: false,
  })
  @IsOptional()
  @IsPhone({ message: 'El teléfono de contacto no es válido.' })
  phone?: string;

  @ApiProperty({
    description: 'Notas adicionales',
    example: 'Actualización de información',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto.' })
  notes?: string;
}
