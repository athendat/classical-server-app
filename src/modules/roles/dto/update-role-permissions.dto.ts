import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty, IsNotEmpty } from 'class-validator';

/**
 * UpdateRolePermissionsDto
 * DTO para actualizar solo los permisos de un rol
 * 
 * Validaciones:
 * - permissionKeys es requerido
 * - permissionKeys debe ser un array
 * - permissionKeys no puede estar vacío
 * - Cada elemento debe ser un string no vacío
 */
export class UpdateRolePermissionsDto {
  @ApiProperty({
    description: 'Array de claves de permisos a asignar',
    example: ['perm.create', 'perm.delete'],
    type: [String],
  })
  @IsArray({
    message: 'permissionKeys must be an array',
  })
  @ArrayNotEmpty({
    message: 'permissionKeys array cannot be empty',
  })
  @IsString({
    each: true,
    message: 'Each permission key must be a string',
  })
  @IsNotEmpty({
    each: true,
    message: 'Permission keys cannot be empty strings',
  })
  permissionKeys: string[];
}
