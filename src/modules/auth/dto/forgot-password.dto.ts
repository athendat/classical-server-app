import { IsNotEmpty } from 'class-validator';
import { IsPhone } from 'src/common/validators';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Número de teléfono',
    example: '50952149',
  })
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @IsPhone()
  phone: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({
    description: 'Mensaje de respuesta',
    example: 'Código de recuperación enviado al SMS',
  })
  message: string;

  @ApiProperty({
    description: 'ID de la solicitud',
    example: 'req-123456',
  })
  requestId: string;
}
