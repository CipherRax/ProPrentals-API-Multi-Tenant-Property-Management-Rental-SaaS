import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, IsString } from 'class-validator';
import { UnitAvailabilityStatus } from '@prisma/client';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class QueryUnitsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitTypeId?: string;

  @ApiPropertyOptional({ enum: String })
  @IsOptional()
  @IsString()
  unitType?: string;

  @ApiPropertyOptional({ enum: UnitAvailabilityStatus })
  @IsOptional()
  @IsEnum(UnitAvailabilityStatus)
  availabilityStatus?: UnitAvailabilityStatus;
}
