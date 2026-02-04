import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para regenerar el secret de OAuth2 credentials
 * DTO vacío - solo valida la acción de regeneración
 */
export class RegenerateOAuth2SecretDto {
  // DTO vacío intencional - solo acción de regeneración
}

/**
 * DTO para respuesta de regeneración de OAuth2 secret
 */
export class OAuth2SecretRegeneratedDto {
  @ApiProperty({
    description: 'ID del cliente OAuth2 (clientId)',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    type: String,
  })
  clientId: string;

  @ApiProperty({
    description: 'Nuevo secret regenerado (último 4 caracteres mascarados en auditoría)',
    example: 'x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4',
    type: String,
  })
  clientSecret: string;
}
