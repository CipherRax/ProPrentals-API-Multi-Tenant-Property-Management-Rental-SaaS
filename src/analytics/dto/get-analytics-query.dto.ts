import { IsOptional, IsUUID } from 'class-validator';

/**
 * Analytics drill-down scope. Omit both to get the portfolio-wide bundle;
 * pass propertyId or unitTypeId to get that unit's own trend lines.
 */
export class GetAnalyticsQueryDto {
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  unitTypeId?: string;
}
