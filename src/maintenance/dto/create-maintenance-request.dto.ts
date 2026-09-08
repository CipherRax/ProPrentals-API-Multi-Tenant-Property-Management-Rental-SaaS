import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MaintenanceCategory, MaintenancePriority } from '@prisma/client';

export class CreateMaintenanceRequestDto {
  @IsUUID()
  propertyId: string;

  @IsUUID()
  unitId: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(5000)
  description: string;

  @IsEnum(MaintenanceCategory)
  category: MaintenanceCategory;

  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;
}
