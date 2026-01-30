import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    MaxLength,
    IsOptional,
    IsEmail,
    IsPhoneNumber,
    IsUUID,
} from 'class-validator';

/**
 * UpdateUserDto: DTO para actualizar datos del usuario
 * 
 * IMPORTANTE:
 * - Todos los campos son opcionales (PATCH)
 * - Se permite actualizar: email, phone, fullname
 * - NO se pueden actualizar: userId, roleId, password (use endpoint específico)
 */
export class UpdateUserDto {
    @ApiPropertyOptional({
        description: 'Email del usuario',
        example: 'john.updated@example.com',
    })
    @IsOptional()
    @IsEmail({}, { message: 'Email debe ser válido' })
    email?: string;

    @ApiPropertyOptional({
        description: 'Teléfono del usuario',
        example: '51245566',
    })
    @IsOptional()
    @IsPhoneNumber('CU', { message: 'Teléfono no válido' })
    phone?: string;

    @ApiPropertyOptional({
        description: 'Nombre mostrable del usuario',
        example: 'John Doe Updated',
        maxLength: 100,
    })
    @IsOptional()
    @IsString({ message: 'fullname debe ser una cadena de texto' })
    @MaxLength(100, { message: 'fullname no puede exceder 100 caracteres' })
    fullname?: string;

    @ApiProperty({
        description: 'Identificador del interno del rol (UUID v4)',
        example: 'user',
    })
    @IsUUID('4', { message: 'roleId debe ser un UUID válido' })
    roleId: string;
}
