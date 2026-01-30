import {
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  Length,
} from 'class-validator';
import { IsPhone } from 'src/common/validators';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Número de teléfono',
    example: '50952149',
  })
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @IsPhone()
  phone: string;

  @ApiProperty({
    description: 'Código de recuperación (6 dígitos)',
    example: '123456',
  })
  @IsNotEmpty({ message: 'El código de recuperación es requerido' })
  @IsString()
  @Length(6, 6, { message: 'El código debe tener exactamente 6 dígitos' })
  resetCode: string;

  @ApiProperty({
    description:
      'Nueva contraseña (mínimo 8 caracteres, mayúscula, minúscula, número y símbolo)',
    example: 'NewPassword@123',
  })
  @IsNotEmpty({ message: 'La nueva contraseña es requerida' })
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

export class ResetPasswordResponseDto {
  @ApiProperty({
    description: 'Mensaje de respuesta',
    example: 'Contraseña actualizada exitosamente',
  })
  message: string;

  @ApiProperty({
    description: 'ID de la solicitud',
    example: 'req-123456',
  })
  requestId: string;
}
