import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MaintenanceStatus } from '@prisma/client';

export class UpdateMaintenanceStatusDto {
  @IsEnum(MaintenanceStatus)
  status: MaintenanceStatus;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  resolution?: string;
}
