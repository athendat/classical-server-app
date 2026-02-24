/**
 * DTO: DeviceKeyExchangeRequestDto
 * 
 * Solicitud del dispositivo móvil al servidor para intercambiar claves públicas ECDH.
 * Validaciones se aplican usando class-validator.
 */

import {
  IsBase64,
  IsUUID,
  Matches,
  IsIn,
  MaxLength,
  MinLength,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeviceKeyExchangeRequestDto {
  @ApiProperty({
    description:
      'Clave pública ECDH P-256 del dispositivo (Base64, 65 bytes uncompressed)',
    example: 'BK3mNpQvWx7Zr3ah4K9mLjPqRsTuVwXyZ0aBcDeFgHiJkLmNoPqRsTuVwXyZ0aBcDeFgHiJkLmNoPqRsTuVw=',
  })
  @IsBase64({}, { message: 'La clave pública del dispositivo debe estar en formato Base64 válido' })
  @MinLength(88, { message: 'La clave pública del dispositivo debe tener al menos 88 caracteres' })
  @MaxLength(88, { message: 'La clave pública del dispositivo no puede superar los 88 caracteres' })
  device_public_key: string;

  @ApiProperty({
    description: 'Identificador único del dispositivo',
    example: 'BP2A.250605.031.A3',
  })
  @IsString({ message: 'El identificador del dispositivo debe ser una cadena de texto' })
  @MinLength(5, { message: 'El identificador del dispositivo debe tener al menos 5 caracteres' })
  @MaxLength(50, { message: 'El identificador del dispositivo no puede superar los 50 caracteres' })
  device_id: string;

  @ApiProperty({
    description: 'Versión de la aplicación móvil (semantic versioning)',
    example: '1.0.0',
  })
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'La versión de la aplicación debe seguir el formato de versionado semántico (ej: 1.0.0)' })
  app_version: string;

  @ApiProperty({
    description: 'Plataforma del dispositivo',
    example: 'android',
    enum: ['android', 'ios'],
  })
  @IsIn(['android', 'ios'], { message: 'La plataforma debe ser "android" o "ios"' })
  platform: 'android' | 'ios';

  @ApiPropertyOptional({
    description: 'Nombre amigable del dispositivo (opcional)',
    example: 'Mi iPhone 14',
    required: false,
  })
  @IsOptional()
  @MinLength(1, { message: 'El nombre del dispositivo debe tener al menos 1 carácter' })
  @MaxLength(100, { message: 'El nombre del dispositivo no puede superar los 100 caracteres' })
  device_name?: string;
}
