import {
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'Nombre completo del usuario',
    example: 'Juan Pérez',
  })
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @MaxLength(100, {
    message: 'El nombre completo no puede exceder los 100 caracteres',
  })
  fullname: string;

  @ApiProperty({
    description: 'Número de teléfono (inicia con 5 o 6, 8 dígitos)',
    example: '50952149',
  })
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @IsPhoneNumber('CU', { message: 'Teléfono no válido' })
  phone: string;

  @ApiProperty({
    description: 'Número de identificación',
    example: '88052011235',
  })
  @IsNotEmpty({ message: 'El número de identificación es requerido' })
  @IsString({
    message: 'El número de identificación debe ser una cadena de texto',
  })
  @Length(11, 11, {
    message: 'El número de identificación debe tener exactamente 11 caracteres',
  })
  idNumber: string;

  @ApiProperty({
    description:
      'Contraseña (mínimo 8 caracteres, mayúscula, minúscula, número y símbolo)',
    example: 'P@ssw0rd',
  })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
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

export class RegisterResponseDto {
  @ApiProperty({
    description: 'Mensaje de respuesta',
    example: 'Código de confirmación enviado al SMS',
  })
  message: string;

  @ApiProperty({
    description: 'ID de la solicitud',
    example: 'req-123456',
  })
  requestId: string;
}
