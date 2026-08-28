import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class TerminateTenancyDto {
  @ApiProperty()
  @IsDateString()
  terminationDate: string;

  @ApiProperty()
  @IsString()
  terminationReason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
