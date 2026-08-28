import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenantProfileStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class QueryTenantsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TenantProfileStatus })
  @IsOptional()
  @IsEnum(TenantProfileStatus)
  status?: TenantProfileStatus;
}
