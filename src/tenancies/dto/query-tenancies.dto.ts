import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenancyStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class QueryTenanciesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TenancyStatus })
  @IsOptional()
  @IsEnum(TenancyStatus)
  status?: TenancyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}
