import { ApiProperty } from '@nestjs/swagger';
import { TenantResponseDto } from './tenant-response.dto';

/**
 * DTO para respuesta paginada de tenants
 */
export class TenantPaginatedResponseDto {
  @ApiProperty({
    description: 'Array de tenants',
    type: [TenantResponseDto],
  })
  data: TenantResponseDto[];

  @ApiProperty({
    description: 'Metadatos de paginación',
    example: {
      page: 1,
      limit: 10,
      total: 50,
      totalPages: 5,
      hasNextPage: true,
      hasPreviousPage: false,
    },
  })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
