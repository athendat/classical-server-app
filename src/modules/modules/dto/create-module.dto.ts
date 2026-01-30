import { IsString, IsArray, IsNotEmpty, ArrayMinSize, ValidateNested, IsBoolean, IsOptional, IsNumber, IsInt, Min, MaxLength, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IsValidActions } from '../validators/is-valid-actions.validator';
import { ModuleType } from '../domain/module-type.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para crear un nuevo módulo
 */
export class CreateModuleDto {
  @ApiProperty({ description: 'El nombre del módulo', maxLength: 100 })
  @IsNotEmpty({ message: 'El nombre del módulo es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  name: string;

  @ApiPropertyOptional({ description: 'El parent del módulo', maxLength: 100 })
  @IsOptional()
  @IsString({ message: 'El parent debe ser texto' })
  @MaxLength(100, { message: 'El parent no puede exceder los 100 caracteres' })
  parent?: string;

  @ApiProperty({ description: 'El indicador del módulo', maxLength: 100 })
  @IsNotEmpty({ message: 'El indicador del módulo es requerido' })
  @IsString({ message: 'El indicador debe ser texto' })
  @MaxLength(100, { message: 'El indicador no puede exceder los 100 caracteres' })
  indicator: string;

  @ApiProperty({ description: 'La descripción del módulo', maxLength: 500 })
  @IsNotEmpty({ message: 'La descripción del módulo es requerida' })
  @IsString({ message: 'La descripción debe ser texto' })
  @MaxLength(500, { message: 'La descripción no puede exceder los 500 caracteres' })
  description: string;

  @ApiProperty({ description: 'El icono del módulo', maxLength: 100 })
  @IsNotEmpty({ message: 'El icono es requerido' })
  @IsString({ message: 'El icono debe ser texto' })
  @MaxLength(100, { message: 'El icono no puede exceder los 100 caracteres' })
  icon: string;

  @ApiProperty({ description: 'Las acciones del módulo', isArray: true, type: String })
  @IsNotEmpty({ message: 'Las acciones son requeridas' })
  @IsArray({ message: 'Las acciones deben ser un array' })
  @ArrayMinSize(1, { message: 'Debe haber al menos una acción' })
  @IsValidActions()
  @MaxLength(100, { each: true, message: 'Cada acción no puede exceder los 100 caracteres' })
  actions: string[];

  @ApiPropertyOptional({ description: 'Indica si es del sistema', type: Boolean, default: false })
  @IsOptional()
  @IsBoolean({ message: 'isSystem debe ser un valor booleano' })
  isSystem?: boolean = false;

  @ApiPropertyOptional({ description: 'Tipo de módulo', enum: ModuleType, default: ModuleType.basic })
  @IsOptional()
  @IsEnum(ModuleType, { message: 'El tipo debe ser "basic" o "group"' })
  type?: ModuleType = ModuleType.basic;

  @ApiPropertyOptional({ description: 'Orden del módulo', type: Number, minimum: 0 })
  @IsOptional()
  @IsInt({ message: 'El orden debe ser un número entero' })
  @Min(0, { message: 'El orden debe ser un número entero no negativo' })
  order?: number;

  @ApiPropertyOptional({ description: 'Indica si es navegable', type: Boolean, default: true })
  @IsOptional()
  @IsBoolean({ message: 'isNavigable debe ser un valor booleano' })
  isNavigable?: boolean = true;
}
