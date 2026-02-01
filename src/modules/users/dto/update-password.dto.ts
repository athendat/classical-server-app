import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsStrongPassword,
} from 'class-validator';

export class UpdatePasswordDto {
  @ApiProperty({
    description: 'Nueva contraseña (texto plano, mínimo 8 caracteres)',
    example: 'NewPassword!234',
    minLength: 8,
    maxLength: 128,
  })
  @IsString({ message: 'password debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128, { message: 'La contraseña no puede exceder 128 caracteres' })
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
  password: string;
}
