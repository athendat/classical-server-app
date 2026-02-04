import { IsString, IsArray, IsOptional, IsBoolean, IsUrl } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para crear un webhook
 */
export class CreateTenantWebhookDto {
  @ApiProperty({
    description: 'URL del endpoint que recibirá los webhooks',
    example: 'https://miapp.com/webhook',
    type: String,
  })
  @IsUrl({}, { message: 'La URL debe ser válida' })
  url: string;

  @ApiProperty({
    description: 'Lista de eventos a los que se suscribe el webhook',
    example: ['transaction.created', 'user.updated'],
    type: [String],
  })
  @IsArray({ message: 'events debe ser un arreglo' })
  @IsString({ each: true, message: 'Cada evento debe ser una cadena' })
  events: string[];

  @ApiPropertyOptional({
    description: 'Secreto usado para firmar las peticiones; si no se proporciona se autogenera',
    example: 's3cr3t_... (se genera automáticamente si no se pasa)',
    type: String,
  })
  @IsOptional({ message: 'El secret es opcional' })
  @IsString({ message: 'El secret debe ser una cadena' })
  secret?: string; // Si no se proporciona, se autogenera
}

/**
 * DTO para actualizar un webhook
 */
export class UpdateTenantWebhookDto {
  @ApiPropertyOptional({
    description: 'URL del endpoint (opcional)',
    example: 'https://miapp.com/webhook',
    type: String,
  })
  @IsOptional({ message: 'La URL es opcional' })
  @IsUrl({}, { message: 'La URL debe ser válida' })
  url?: string;

  @ApiPropertyOptional({
    description: 'Lista de eventos (opcional)',
    example: ['transaction.created'],
    type: [String],
  })
  @IsOptional({ message: 'Los events son opcionales' })
  @IsArray({ message: 'events debe ser un arreglo' })
  @IsString({ each: true, message: 'Cada evento debe ser una cadena' })
  events?: string[];

  @ApiPropertyOptional({
    description: 'Indica si el webhook está activo o no',
    example: true,
    type: Boolean,
  })
  @IsOptional({ message: 'El campo active es opcional' })
  @IsBoolean({ message: 'active debe ser un valor booleano' })
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Secreto nuevo para regenerar (opcional)',
    example: 'nuev0s3cret',
    type: String,
  })
  @IsOptional({ message: 'El secret es opcional' })
  @IsString({ message: 'El secret debe ser una cadena' })
  secret?: string; // Para regenerar el secret
}

/**
 * DTO para respuesta de webhook (con secret masked)
 */
export class WebhookResponseDto {
  @ApiProperty({
    description: 'Identificador único del webhook (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    type: String,
  })
  id: string;

  @ApiProperty({
    description: 'URL del webhook',
    example: 'https://miapp.com/webhook',
    type: String,
  })
  url: string;

  @ApiProperty({
    description: 'Eventos suscritos',
    example: ['transaction.created', 'user.updated'],
    type: [String],
  })
  events: string[];

  @ApiProperty({
    description: 'Indica si el webhook está activo',
    example: true,
    type: Boolean,
  })
  active: boolean;

  @ApiProperty({
    description: 'Secreto enmascarado: se muestra parcialmente (ej. xxxx...1234)',
    example: 'xxxx...1234',
    type: String,
  })
  secret: string; // Masked version: "xxxx...last4"

  @ApiProperty({
    description: 'Fecha de creación',
    example: '2026-01-01T12:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Fecha de última actualización',
    example: '2026-01-02T12:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  updatedAt: Date;
}

/**
 * DTO para regenerar el secret de un webhook
 * DTO vacío - solo valida la acción de regeneración
 */
export class RegenerateWebhookSecretDto {
  // DTO vacío intencional - solo acción de regeneración
}

/**
 * DTO para respuesta de regeneración de webhook secret
 */
export class WebhookSecretRegeneratedDto {
  @ApiProperty({
    description: 'ID del webhook',
    example: '550e8400e29b41d4a716446655440000',
    type: String,
  })
  id: string;

  @ApiProperty({
    description: 'Nuevo secret regenerado',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    type: String,
  })
  secret: string;
}

/**
 * DTO para actualizar solo la URL del webhook
 */
export class UpdateWebhookUrlDto {
  @ApiProperty({
    description: 'URL del endpoint que recibirá los webhooks',
    example: 'https://miapp.com/webhook',
    type: String,
  })
  @IsUrl({}, { message: 'La URL debe ser válida' })
  url: string;
}

/**
 * Helper para mapear webhook a DTO de respuesta
 */
export function mapWebhookToResponse(webhook: any, maskedSecret: string): WebhookResponseDto {
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    active: webhook.active,
    secret: maskedSecret,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}
