import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

/**
 * UpdateUserRolesDto: DTO para actualizar el rol de un usuario
 *
 * IMPORTANTE:
 * - Un usuario tiene UN ÚNICO rol principal (roleKey)
 * - Puede tener roles adicionales opcionales (additionalRoleKeys)
 * - Se valida la combinación de roles permitida
 */
export class UpdateUserRolesDto {
  @ApiProperty({
    description: 'Rol único principal a asignar al usuario (NOT an array)',
  })
  @IsString({ message: 'roleKey debe ser un string válido' })
  roleKey: string;

  @ApiPropertyOptional({
    description: 'Array de roles adicionales opcionales',
    example: ['merchant'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'additionalRoleKeys debe ser un array' })
  additionalRoleKeys?: string[];
}
