import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsStrongPassword,
} from 'class-validator';

/**
 * DTO para cambiar la propia contraseña del usuario autenticado.
 *
 * Requiere:
 * - currentPassword: La contraseña actual (para verificación)
 * - newPassword: La nueva contraseña (con validaciones de complejidad)
 *
 * Uso: PATCH /users/me/password
 */
export class UpdateMyPasswordDto {
  @ApiProperty({
    description: 'Contraseña actual (texto plano)',
    example: 'CurrentPassword!123',
  })
  @IsString({ message: 'currentPassword debe ser una cadena de texto' })
  currentPassword: string;

  @ApiProperty({
    description: 'Nueva contraseña (texto plano, mínimo 8 caracteres)',
    example: 'NewPassword!234',
    minLength: 8,
    maxLength: 128,
  })
  @IsString({ message: 'newPassword debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128, {
    message: 'La contraseña no puede exceder 128 caracteres',
  })
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'La contraseña debe tener al menos 8 caracteres, incluyendo una mayúscula, una minúscula, un número y un símbolo',
    },
  )
  newPassword: string;
}
