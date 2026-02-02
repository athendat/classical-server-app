import { ApiProperty } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CreateModuleDto } from './create-module.dto';
import { PermissionDto } from './permission.dto';

/**
 * DTO para actualizar un módulo existente
 */
export class UpdateModuleDto extends PartialType(CreateModuleDto) {
  @ApiProperty({
    description: 'Module id',
    example: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
  })
  @IsOptional()
  @IsString({ message: 'El id del módulo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El id del módulo no debe estar vacío' })
  id: string;

  @ApiProperty({
    description: 'Module status',
    enum: ['active', 'disabled'],
    example: 'active',
  })
  @IsOptional()
  @IsString({ message: 'El estado del módulo debe ser una cadena de texto' })
  status: 'active' | 'disabled';

  @ApiProperty({
    description: 'List of permissions',
    isArray: true,
    type: [PermissionDto],
  })
  @IsOptional()
  @IsArray({ message: 'Los permisos deben ser un arreglo' })
  @ArrayMinSize(1, { message: 'Se requiere al menos un permiso' })
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions: PermissionDto[];
}
