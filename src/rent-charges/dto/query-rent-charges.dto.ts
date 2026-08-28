import { ApiPropertyOptional } from '@nestjs/swagger';
import { RentChargeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class QueryRentChargesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RentChargeStatus })
  @IsOptional()
  @IsEnum(RentChargeStatus)
  status?: RentChargeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenancyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitId?: string;
}
