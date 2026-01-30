import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, MaxLength } from 'class-validator';

/**
 * DTO para crear/actualizar permisos
 * Estructura de un Permiso dentro de un Módulo
 */
export class PermissionDto {
    @ApiPropertyOptional({
        description: 'ID único del permiso (auto-generado si no se proporciona)',
        example: 'gw_v',
        maxLength: 50,
    })
    @IsOptional()
    @IsString({ message: 'El id del permiso debe ser una cadena de texto' })
    @MaxLength(50, { message: 'El id del permiso no puede exceder 50 caracteres' })
    id?: string;

    @ApiProperty({
        description: 'Nombre legible del permiso',
        example: 'Ver Pasarelas',
        maxLength: 100,
    })
    @IsNotEmpty({ message: 'El nombre del permiso es requerido' })
    @IsString({ message: 'El nombre del permiso debe ser una cadena de texto' })
    @MaxLength(100, { message: 'El nombre del permiso no puede exceder 100 caracteres' })
    name: string;

    @ApiProperty({
        description: 'Indicador del permiso en formato module.action',
        example: 'gateways.view',
        maxLength: 100,
    })
    @IsNotEmpty({ message: 'El indicador del permiso es requerido' })
    @IsString({ message: 'El indicador del permiso debe ser una cadena de texto' })
    @MaxLength(100, { message: 'El indicador del permiso no puede exceder 100 caracteres' })
    indicator: string;

    @ApiProperty({
        description: 'Descripción detallada del permiso, orientada al usuario',
        example: 'Permite ver la lista de pasarelas y sus detalles',
        maxLength: 500,
    })
    @IsNotEmpty({ message: 'La descripción del permiso es requerida' })
    @IsString({ message: 'La descripción del permiso debe ser una cadena de texto' })
    @MaxLength(500, { message: 'La descripción del permiso no puede exceder 500 caracteres' })
    description: string;

    @ApiPropertyOptional({
        description: 'Icono representativo del permiso',
        example: 'lock',
        maxLength: 100,
    })
    @IsOptional()
    @IsString({ message: 'El icono del permiso debe ser una cadena de texto' })
    @MaxLength(30, { message: 'El icono del permiso no puede exceder 30 caracteres' })
    icon?: string;

    @ApiProperty({
        description: 'Estado del permiso: activo o desactivado',
        example: true,
        type: Boolean,
    })
    @IsNotEmpty({ message: 'El estado del permiso es requerido' })
    @IsBoolean({ message: 'El estado del permiso debe ser booleano' })
    enabled: boolean;

    @ApiPropertyOptional({
        description: 'Flag especial para permisos que requieren Super Admin',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean({ message: 'requiresSuperAdmin debe ser booleano' })
    requiresSuperAdmin?: boolean;
}
