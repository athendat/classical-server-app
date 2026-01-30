import { IsNotEmpty, IsString, Length } from 'class-validator';
import { IsPhone } from 'src/common/validators';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmPhoneDto {
  @ApiProperty({
    description: 'Número de teléfono',
    example: '50952149',
  })
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @IsPhone()
  phone: string;

  @ApiProperty({
    description: 'Código de confirmación (6 dígitos)',
    example: '123456',
  })
  @IsNotEmpty({ message: 'El código de confirmación es requerido' })
  @IsString()
  @Length(6, 6, { message: 'El código debe tener exactamente 6 dígitos' })
  confirmationCode: string;
}

export class ConfirmPhoneResponseDto {
  @ApiProperty({
    description: 'Mensaje de respuesta',
    example: 'Teléfono confirmado exitosamente',
  })
  message: string;

  @ApiProperty({
    description: 'ID de la solicitud',
    example: 'req-123456',
  })
  requestId: string;
}
