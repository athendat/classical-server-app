import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsString, IsNotEmpty, IsInt, Min, IsOptional, MaxLength } from 'class-validator';

/**
 * DTO para reordenar módulos
 * Puede ser de dos tipos:
 * 1. Reorden dentro de un padre: proporcionar parent con items de ese padre
 * 2. Reorden de nivel superior: no proporcionar parent, solo items de nivel superior
 */
export class ReorderModulesDto {
  @ApiProperty({ description: 'El id del módulo', example: 'module-123', maxLength: 100 })
  @IsNotEmpty({ message: 'El id del módulo es requerido' })
  @IsString({ message: 'El id del módulo debe ser texto' })
  @MaxLength(100, { message: 'El id del módulo no puede exceder 100 caracteres' })
  id: string;

  @ApiProperty({ description: 'El orden del módulo', example: 0, minimum: 0 })
  @IsNotEmpty({ message: 'El orden es requerido' })
  @IsInt({ message: 'El orden debe ser un número entero' })
  @Min(0, { message: 'El orden debe ser un número entero no negativo' })
  order: number;

  @ApiPropertyOptional({ description: 'El id del padre (opcional)', example: 'parent-1', maxLength: 100 })
  @IsOptional()
  @IsString({ message: 'El padre debe ser texto' })
  @MaxLength(100, { message: 'El padre no puede exceder 100 caracteres' })
  parent?: string;
}
