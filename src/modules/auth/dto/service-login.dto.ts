import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para login de servicio con OAuth2 credentials
 */
export class ServiceLoginDto {
  @ApiProperty({
    description: 'OAuth2 Client ID del tenant',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    type: String,
  })
  @IsString({ message: 'clientId debe ser una cadena' })
  @IsNotEmpty({ message: 'clientId es requerido' })
  clientId: string;

  @ApiProperty({
    description: 'OAuth2 Client Secret del tenant',
    example: 'x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4',
    type: String,
  })
  @IsString({ message: 'clientSecret debe ser una cadena' })
  @IsNotEmpty({ message: 'clientSecret es requerido' })
  clientSecret: string;
}
