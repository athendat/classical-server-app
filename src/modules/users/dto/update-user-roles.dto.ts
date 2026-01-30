import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * UpdateUserRolesDto: DTO para actualizar el rol de un usuario
 * 
 * IMPORTANTE:
 * - Un usuario solo puede tener UN ÚNICO rol (no array)
 * - El roleId debe ser una cadena de texto válida
 */
export class UpdateUserRolesDto {
  @ApiProperty({
    description: 'Rol único a asignar al usuario (NOT an array)',
  })
  @IsUUID('4', { message: 'roleId debe ser un UUID válido' })
  roleId: string;
}
