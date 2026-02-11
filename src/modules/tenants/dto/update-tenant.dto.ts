import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsLuhnCard, IsPhone } from 'src/common/validators';
import { BusinessAddressDto } from './create-tenant.dto';

/**
 * DTO para actualizar un Tenant existente
 * Todos los campos son opcionales
 */
export class UpdateTenantDto {
  @ApiProperty({
    description: 'Nombre legal del negocio',
    example: 'Mi Empresa S.A.',
  })
  @IsNotEmpty({ message: 'El nombre legal del negocio no puede estar vacío.' })
  @IsString({
    message: 'El nombre legal del negocio debe ser una cadena de texto.',
  })
  @MaxLength(255, {
    message: 'El nombre legal del negocio no puede exceder 255 caracteres.',
  })
  businessName: string;


  @ApiProperty({
    description: 'Número de identificación tributaria (NIT) del negocio',
    example: '12345678901',
  })
  @IsString({ message: 'El NIT debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El NIT es obligatorio' })
  @Length(11, 11, { message: 'El NIT debe tener exactamente 11 caracteres' })
  @Matches(/^[0-9]{11}$/, {
    message: 'El NIT debe contener solo números',
  })
  nit: string;

  @ApiPropertyOptional({
    description: 'Código MCC del negocio (Merchant Category Code)',
    example: '5411',
  })
  @IsOptional()
  @IsString({ message: 'El código MCC debe ser una cadena de texto' })
  @Length(4, 4, {
    message: 'El código MCC debe tener exactamente 4 caracteres',
  })
  @Matches(/^[0-9]{4}$/, {
    message: 'El código MCC debe contener solo números',
  })
  mcc?: string;

  @ApiProperty({
    description: 'Número de tarjeta bancaria (PAN) con validación Luhn',
    example: '4532-1234-5678-9010',
  })
  @IsLuhnCard({
    message: 'El número de tarjeta no es válido',
  })
  pan: string;

  @ApiPropertyOptional({
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

  @ApiPropertyOptional({
    description: 'Dirección del negocio',
    type: BusinessAddressDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested({ message: 'La dirección del negocio no es válida.' })
  @Type(() => BusinessAddressDto)
  businessAddress?: BusinessAddressDto;

  @ApiPropertyOptional({
    description: 'Email del negocio',
    example: 'contacto@miempresa.com',
    required: false,
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico del negocio no es válido.' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Teléfono de contacto',
    example: '55551234',
    required: false,
  })
  @IsOptional()
  @IsPhone({ message: 'El teléfono de contacto no es válido.' })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Notas adicionales',
    example: 'Actualización de información',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto.' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'URL del sitio web del negocio',
    example: 'https://www.miempresa.com',
  })
  @IsOptional()
  @IsUrl({}, { message: 'La URL del sitio web no es válida.' })
  website?: string;
}
