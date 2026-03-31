import { IsString, IsOptional, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TerminalCapability } from '../domain/constants/terminal.constants';
import { TerminalLocationDto } from './create-terminal.dto';

export class UpdateTerminalDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(TerminalCapability, { each: true })
  capabilities?: string[];

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
