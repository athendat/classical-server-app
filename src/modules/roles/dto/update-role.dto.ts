import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, MinLength, MaxLength, IsBoolean, IsEnum } from 'class-validator';
import { RoleStatus } from '../domain/role.enums';

/**
 * UpdateRoleDto - DTO para actualizar un rol existente
 */
export class UpdateRoleDto {
  @ApiPropertyOptional({ description: 'Nombre legible del rol (opcional)', example: 'Administrador' })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'El nombre no debe exceder 100 caracteres' })
  name?: string;

  @ApiPropertyOptional({ description: 'Material Symbol icon name (opcional)', example: 'security' })
  @IsOptional()
  @IsString({ message: 'El icono debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El icono no debe exceder 50 caracteres' })
  icon?: string;

  @ApiPropertyOptional({ description: 'Descripción del rol (opcional)', example: 'Rol con permisos administrativos' })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(500, { message: 'La descripción no debe exceder 500 caracteres' })
  description?: string;

  @ApiPropertyOptional({ description: 'Array de claves de permisos a asignar (opcional)', example: ['user.create', 'user.delete'] })
  @IsOptional()
  @IsArray({ message: 'permissionKeys debe ser un arreglo' })
  @IsString({ each: true, message: 'Cada clave de permiso debe ser una cadena de texto' })
  permissionKeys?: string[];

  @ApiPropertyOptional({ description: 'Estado del rol (opcional)'})
  @IsOptional()
  @IsEnum(RoleStatus, { message: 'El estado del rol debe ser un valor válido' })
  status?: RoleStatus;
}
