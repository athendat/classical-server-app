import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsPhone } from 'src/common/validators';
import { IsLuhnCard } from 'src/common/validators';

/**
 * DTO para la dirección del negocio
 */
export class BusinessAddressDto {
  @ApiProperty({
    description: 'Dirección física del negocio',
    example: 'Calle Principal 123',
  })
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La dirección es obligatoria' })
  @MaxLength(255, {
    message: 'La dirección no puede tener más de 255 caracteres',
  })
  address: string;

  @ApiProperty({
    description: 'Ciudad',
    example: 'San José',
  })
  @IsString({ message: 'La ciudad debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La ciudad es obligatoria' })
  @MaxLength(100, { message: 'La ciudad no puede tener más de 100 caracteres' })
  city: string;

  @ApiProperty({
    description: 'Provincia/Estado',
    example: 'San José',
  })
  @IsString({ message: 'La provincia/estado debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La provincia/estado es obligatoria' })
  @MaxLength(100, {
    message: 'La provincia/estado no puede tener más de 100 caracteres',
  })
  state: string;

  @ApiProperty({
    description: 'Código postal',
    example: '10101',
  })
  @IsString({ message: 'El código postal debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El código postal es obligatorio' })
  @MaxLength(10, {
    message: 'El código postal no puede tener más de 10 caracteres',
  })
  zipCode: string;

  @ApiProperty({
    description: 'País (opcional)',
    example: 'Costa Rica',
    required: false,
  })
  @IsString({ message: 'El país debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El país no puede tener más de 100 caracteres' })
  country?: string;
}

/**
 * DTO para crear un nuevo Tenant
 */
export class CreateTenantDto {
  @ApiProperty({
    description: 'Nombre legal del negocio',
    example: 'Mi Empresa S.A.',
  })
  @IsString({
    message: 'El nombre legal del negocio debe ser una cadena de texto',
  })
  @IsNotEmpty({ message: 'El nombre legal del negocio es obligatorio' })
  @MaxLength(255, {
    message: 'El nombre legal del negocio no puede tener más de 255 caracteres',
  })
  businessName: string;

  @ApiProperty({
    description: 'Nombre del representante legal',
    example: 'Juan Pérez García',
  })
  @IsString({
    message: 'El nombre del representante legal debe ser una cadena de texto',
  })
  @IsNotEmpty({ message: 'El nombre del representante legal es obligatorio' })
  @MaxLength(255, {
    message:
      'El nombre del representante legal no puede tener más de 255 caracteres',
  })
  legalRepresentative: string;

  @ApiProperty({
    description: 'Dirección del negocio',
    type: BusinessAddressDto,
  })
  @ValidateNested()
  @Type(() => BusinessAddressDto)
  businessAddress: BusinessAddressDto;

  @ApiProperty({
    description: 'Número de tarjeta bancaria (PAN) con validación Luhn',
    example: '4532-1234-5678-9010',
  })
  @IsLuhnCard({
    message: 'El número de tarjeta no es válido',
  })
  pan: string;

  @ApiProperty({
    description: 'Email del negocio (único)',
    example: 'contacto@miempresa.com',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  email: string;

  @ApiProperty({
    description: 'Teléfono de contacto (formato: 8 dígitos, inicio 5 o 6)',
    example: '55551234',
  })
  @IsPhone({
    message:
      'El teléfono no tiene un formato válido (8 dígitos, inicia en 5 o 6)',
  })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  phone: string;

  @ApiProperty({
    description: 'Notas adicionales (opcional)',
    example: 'Negocio de importación y exportación',
    required: false,
  })
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  notes?: string;
}
