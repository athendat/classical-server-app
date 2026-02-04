import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsPhoneNumber,
  IsEmail,
  IsString,
  MaxLength,
  Length,
  IsStrongPassword,
} from 'class-validator';

/**
 * MerchantRegistrationDto: DTO para auto-registro de comerciantes
 *
 * Campos requeridos:
 * - phone: Teléfono obligatorio (validado con formato cubano)
 * - email: Email obligatorio (debe ser único en plataforma)
 * - password: Contraseña fuerte (8+ chars, mayúscula, minúscula, número, símbolo)
 * - fullname: Nombre completo del responsable
 * - idNumber: Número de identificación (11 caracteres)
 * - businessName: Nombre del negocio
 *
 * Al registrarse, el usuario se crea con:
 * - roleKey: 'user'
 * - additionalRoleKeys: ['merchant']
 * - O si existe como user, se agrega 'merchant' a additionalRoleKeys
 *
 * Validación de rechazo (409):
 * - Si el email ya existe en otro usuario
 * - Si el usuario existente tiene rol administrativo (super_admin, admin, ops)
 */
export class MerchantRegistrationDto {
  @ApiProperty({
    description: 'Teléfono del responsable (obligatorio, formato cubano)',
    example: '50952149',
  })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @IsPhoneNumber('CU', {
    message: 'El teléfono debe ser un número válido (formato cubano)',
  })
  phone: string;

  @ApiProperty({
    description: 'Email del responsable (obligatorio, debe ser único)',
    example: 'merchant@example.com',
  })
  @IsNotEmpty({ message: 'El email es obligatorio' })
  @IsEmail({}, { message: 'El email debe ser válido' })
  email: string;

  @ApiProperty({
    description:
      'Contraseña fuerte (mínimo 8 caracteres, mayúscula, minúscula, número y símbolo)',
    example: 'SecurePassword!123',
  })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
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
        'La contraseña debe tener al menos 8 caracteres, incluir mayúscula, minúscula, número y símbolo',
    },
  )
  password: string;

  @ApiProperty({
    description: 'Nombre completo del responsable del negocio',
    example: 'Juan Pérez',
  })
  @IsNotEmpty({ message: 'El nombre completo es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(100, {
    message: 'El nombre no puede exceder 100 caracteres',
  })
  fullname: string;

  @ApiProperty({
    description: 'Número de identificación (exactamente 11 caracteres)',
    example: '88052011235',
  })
  @IsNotEmpty({ message: 'El número de identificación es obligatorio' })
  @IsString({
    message: 'El número de identificación debe ser una cadena de texto',
  })
  @Length(11, 11, {
    message: 'El número de identificación debe tener exactamente 11 caracteres',
  })
  idNumber: string;

}
