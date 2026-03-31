import { IsOptional, IsString } from 'class-validator';

export class AdminTerminalFiltersDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  capability?: string;
}
