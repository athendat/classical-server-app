import { IsString, IsNotEmpty, IsEnum, IsArray, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TerminalType, TerminalCapability } from '../domain/constants/terminal.constants';

export class TerminalLocationDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class CreateTerminalDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(TerminalType)
  type: TerminalType;

  @IsArray()
  @IsEnum(TerminalCapability, { each: true })
  capabilities: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TerminalLocationDto)
  location?: TerminalLocationDto;

  @IsOptional()
  @IsString()
  deviceSerial?: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  deviceManufacturer?: string;
}
