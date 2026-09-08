import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MaintenanceCategory, MaintenanceStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class QueryMaintenanceDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

  @IsOptional()
  @IsEnum(MaintenanceCategory)
  category?: MaintenanceCategory;

  @IsOptional()
  @IsUUID()
  propertyId?: string;
}
