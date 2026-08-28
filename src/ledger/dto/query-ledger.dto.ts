import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class QueryLedgerDto {
  @ApiPropertyOptional({ description: 'ISO date — defaults to the tenancy start date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date — defaults to now' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
