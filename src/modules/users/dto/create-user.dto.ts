import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEmail,
  IsPhoneNumber,
  Matches,
  Length,
} from 'class-validator';

/**
 * CreateUserDto: DTO para creación de nuevos usuarios
 *
 * IMPORTANTE:
 * - El userId se extrae automáticamente del JWT (contexto)
 * - El usuario solo puede tener UN ÚNICO rol (no array)
 * - La contraseña se proporciona en texto plano y se hashea en el servicio
 */
export class CreateUserDto {
  @ApiPropertyOptional({
    description: 'Email del usuario',
    example: 'john@example.com',
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
  phone: string;

  @ApiPropertyOptional({
    description: 'Nombre mostrable del usuario',
    example: 'John Doe',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'fullname no puede exceder 100 caracteres' })
  fullname?: string;

  @ApiPropertyOptional({
    description: 'Número de identificación',
    example: '12345678',
  })
  @IsOptional()
  @IsString({
    message: 'El número de identificación debe ser una cadena de texto',
  })
  @Length(11, 11, {
    message: 'El número de identificación debe tener exactamente 11 caracteres',
  })
  idNumber: string;

  @ApiProperty({
    description: 'Rol único asignado al usuario (NOT an array - single role)',
    example: 'user',
    minLength: 1,
    maxLength: 50,
  })
  @IsString({ message: 'roleKey debe ser una cadena de texto' })
  @MinLength(1, { message: 'roleKey debe tener al menos 1 carácter' })
  @MaxLength(50, { message: 'roleKey no puede exceder 50 caracteres' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'roleKey solo puede contener letras, números, guiones y guiones bajos',
  })
  roleKey: string;

  @ApiProperty({
    description: 'Contraseña del usuario (texto plano, mínimo 8 caracteres)',
    example: 'SecurePassword!123',
    minLength: 8,
    maxLength: 128,
  })
  @IsString({ message: 'password debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128, { message: 'La contraseña no puede exceder 128 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial (@$!%*?&)',
  })
  password: string;
}
