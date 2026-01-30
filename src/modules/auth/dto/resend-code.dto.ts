import { IsNotEmpty } from 'class-validator';
import { IsPhone } from 'src/common/validators';
import { ApiProperty } from '@nestjs/swagger';

export class ResendCodeDto {
  @ApiProperty({
    description: 'Número de teléfono',
    example: '50952149',
  })
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @IsPhone()
  phone: string;
}

export class ResendCodeResponseDto {
  @ApiProperty({
    description: 'Mensaje de respuesta',
    example: 'Nuevo código enviado (2 reenvíos restantes)',
  })
  message: string;

  @ApiProperty({
    description: 'ID de la solicitud',
    example: 'req-123456',
  })
  requestId: string;

  @ApiProperty({
    description: 'Reenvíos restantes en 24 horas',
    example: 2,
  })
  resendCountRemaining: number;
}
