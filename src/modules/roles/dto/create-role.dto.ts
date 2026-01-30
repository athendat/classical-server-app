import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * CreateRoleDto - DTO para crear un nuevo rol
 */
export class CreateRoleDto {
  @ApiProperty({
    description: 'Identificador único del rol (lowercase con dashes). Ej: "custom-admin", "content-editor"',
    example: 'custom-admin',
    minLength: 3,
    maxLength: 50,
  })
  @IsString({ message: 'La clave (key) debe ser una cadena de texto' })
  @MinLength(3, { message: 'La clave (key) debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'La clave (key) debe tener como máximo 50 caracteres' })
  @Matches(/^[a-z0-9-]+$/, { message: 'La clave (key) solo puede contener letras minúsculas, números y guiones' })
  key: string;

  @ApiProperty({
    description: 'Nombre legible del rol',
    example: 'Administrador personalizado',
    minLength: 3,
    maxLength: 100,
  })
  @IsString({ message: 'El nombre (name) debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nombre (name) debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'El nombre (name) debe tener como máximo 100 caracteres' })
  name: string;

  @ApiPropertyOptional({
    description: 'Material Symbol icon name (opcional)',
    example: 'admin_panel_settings',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'El icono (icon) debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El icono (icon) debe tener como máximo 50 caracteres' })
  icon?: string;

  @ApiPropertyOptional({
    description: 'Descripción del rol (opcional)',
    example: 'Rol con permisos para gestionar contenido',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(500, { message: 'La descripción debe tener como máximo 500 caracteres' })
  description?: string;

  @ApiProperty({
    description: 'Array de claves de permisos a asignar',
    example: ['perm.create', 'perm.delete'],
    type: [String],
  })
  @IsArray({ message: 'permissionKeys debe ser un arreglo' })
  @IsString({ each: true, message: 'Cada clave en permissionKeys debe ser una cadena de texto' })
  permissionKeys: string[];
}
